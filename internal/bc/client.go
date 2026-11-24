package bc

import (
	"bytes"
	"context"
	"encoding/json"
	"encoding/xml"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"
)

type Param struct {
	Name  string
	Value string
}

type APIError struct {
	Code    string            `json:"code"`
	Message string            `json:"message"`
	Fields  map[string]string `json:"fields"`
}

func (e *APIError) Error() string { return e.Code + ": " + e.Message }

type UpstreamError struct {
	Kind   string // "unavailable", "auth", "fault" or "protocol"
	Detail string
}

func (e *UpstreamError) Error() string { return e.Kind + ": " + e.Detail }

type Client struct {
	endpoint  string
	namespace string
	user      string
	password  string
	http      *http.Client
}

func NewClient(baseURL, instance, company, service, user, password string) *Client {
	endpoint := fmt.Sprintf("%s/%s/WS/%s/Codeunit/%s",
		baseURL, url.PathEscape(instance), url.PathEscape(company), url.PathEscape(service))
	return &Client{
		endpoint:  endpoint,
		namespace: "urn:microsoft-dynamics-schemas/codeunit/" + service,
		user:      user,
		password:  password,
		http:      &http.Client{Timeout: 30 * time.Second},
	}
}

type resultEnvelope struct {
	OK    bool            `json:"ok"`
	Data  json.RawMessage `json:"data"`
	Error *APIError       `json:"error"`
}

type soapReply struct {
	Body struct {
		Fault *struct {
			FaultString string `xml:"faultstring"`
		} `xml:"Fault"`
		Results []struct {
			ReturnValue string `xml:"return_value"`
		} `xml:",any"`
	} `xml:"Body"`
}

func (c *Client) Call(ctx context.Context, operation string, params ...Param) (json.RawMessage, error) {
	body := c.buildEnvelope(operation, params)

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, c.endpoint, bytes.NewReader(body))
	if err != nil {
		return nil, &UpstreamError{Kind: "protocol", Detail: err.Error()}
	}
	req.SetBasicAuth(c.user, c.password)
	req.Header.Set("Content-Type", "text/xml; charset=utf-8")
	req.Header.Set("SOAPAction", c.namespace+":"+operation)

	resp, err := c.http.Do(req)
	if err != nil {
		return nil, &UpstreamError{Kind: "unavailable", Detail: err.Error()}
	}
	defer resp.Body.Close()

	raw, err := io.ReadAll(io.LimitReader(resp.Body, 32<<20))
	if err != nil {
		return nil, &UpstreamError{Kind: "unavailable", Detail: err.Error()}
	}

	if resp.StatusCode == http.StatusUnauthorized || resp.StatusCode == http.StatusForbidden {
		return nil, &UpstreamError{Kind: "auth", Detail: fmt.Sprintf("BC answered HTTP %d", resp.StatusCode)}
	}

	var reply soapReply
	if err := xml.Unmarshal(raw, &reply); err != nil {
		return nil, &UpstreamError{
			Kind:   "protocol",
			Detail: fmt.Sprintf("HTTP %d with a reply that is not SOAP XML: %v", resp.StatusCode, err),
		}
	}

	if reply.Body.Fault != nil {
		return nil, &UpstreamError{Kind: "fault", Detail: strings.TrimSpace(reply.Body.Fault.FaultString)}
	}
	if len(reply.Body.Results) == 0 {
		return nil, &UpstreamError{Kind: "protocol", Detail: fmt.Sprintf("HTTP %d with no result element", resp.StatusCode)}
	}

	var env resultEnvelope
	if err := json.Unmarshal([]byte(reply.Body.Results[0].ReturnValue), &env); err != nil {
		return nil, &UpstreamError{Kind: "protocol", Detail: "return_value is not the expected JSON: " + err.Error()}
	}
	if !env.OK {
		if env.Error == nil {
			return nil, &UpstreamError{Kind: "protocol", Detail: "ok=false without an error object"}
		}
		return nil, env.Error
	}
	return env.Data, nil
}

func (c *Client) buildEnvelope(operation string, params []Param) []byte {
	var b bytes.Buffer
	b.WriteString(`<?xml version="1.0" encoding="utf-8"?>`)
	b.WriteString(`<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/"><soap:Body>`)
	fmt.Fprintf(&b, `<%s xmlns="%s">`, operation, c.namespace)
	for _, p := range params {
		fmt.Fprintf(&b, "<%s>", p.Name)
		_ = xml.EscapeText(&b, []byte(p.Value))
		fmt.Fprintf(&b, "</%s>", p.Name)
	}
	fmt.Fprintf(&b, "</%s></soap:Body></soap:Envelope>", operation)
	return b.Bytes()
}
