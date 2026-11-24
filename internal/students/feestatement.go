package students

import (
	"bytes"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"net/http"
	"regexp"
	"strconv"
	"strings"
	"time"

	"student-portal-api/internal/bc"
)

var unsafeFileChars = regexp.MustCompile(`[^A-Za-z0-9._-]+`)

func (h *Handler) FeeStatement(w http.ResponseWriter, r *http.Request) {
	no, ok := h.studentNo(w, r)
	if !ok {
		return
	}

	q := r.URL.Query()
	from := strings.TrimSpace(q.Get("from"))
	to := strings.TrimSpace(q.Get("to"))

	problems := map[string]string{}
	var fromDate, toDate time.Time
	if from != "" {
		t, err := time.Parse("2006-01-02", from)
		if err != nil {
			problems["from"] = "Use the format YYYY-MM-DD."
		}
		fromDate = t
	}
	if to != "" {
		t, err := time.Parse("2006-01-02", to)
		if err != nil {
			problems["to"] = "Use the format YYYY-MM-DD."
		}
		toDate = t
	}
	if _, bad := problems["from"]; !bad && !fromDate.IsZero() && !toDate.IsZero() && fromDate.After(toDate) {
		problems["from"] = "The start date must not be after the end date."
	}
	if len(problems) > 0 {
		h.respondError(w, r, http.StatusUnprocessableEntity, "VALIDATION_ERROR",
			"Please correct the dates.", problems)
		return
	}

	data, err := h.bc.Call(r.Context(), "GetFeeStatement",
		bc.Param{Name: "studentNo", Value: no},
		bc.Param{Name: "fromDate", Value: from},
		bc.Param{Name: "toDate", Value: to},
	)
	if err != nil {
		h.fail(w, r, err)
		return
	}

	var doc struct {
		FileName string `json:"fileName"`
		Base64   string `json:"base64"`
	}
	if err := json.Unmarshal(data, &doc); err != nil {
		h.fail(w, r, &bc.UpstreamError{Kind: "protocol", Detail: "fee statement data: " + err.Error()})
		return
	}
	pdf, err := base64.StdEncoding.DecodeString(doc.Base64)
	if err != nil {
		h.fail(w, r, &bc.UpstreamError{Kind: "protocol", Detail: "fee statement is not valid Base64: " + err.Error()})
		return
	}
	// Every PDF starts with "%PDF-". If it does not, BC returned something else
	// (an empty report, for example) and the user must not be handed a broken file.
	if !bytes.HasPrefix(pdf, []byte("%PDF-")) {
		h.fail(w, r, &bc.UpstreamError{Kind: "protocol", Detail: fmt.Sprintf("fee statement is not a PDF (%d bytes)", len(pdf))})
		return
	}

	name := strings.Trim(unsafeFileChars.ReplaceAllString(doc.FileName, "-"), "-.")
	if name == "" {
		name = "fee-statement.pdf"
	}

	disposition := "attachment"
	if q.Get("inline") == "1" {
		disposition = "inline"
	}

	w.Header().Set("Content-Type", "application/pdf")
	w.Header().Set("Content-Disposition", fmt.Sprintf(`%s; filename="%s"`, disposition, name))
	w.Header().Set("Content-Length", strconv.Itoa(len(pdf)))
	w.Header().Set("Cache-Control", "no-store") // financial data: never cache it
	w.Header().Set("X-Content-Type-Options", "nosniff")
	w.WriteHeader(http.StatusOK)
	_, _ = w.Write(pdf)
}