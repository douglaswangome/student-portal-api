package httpx

import (
	"encoding/json"
	"net/http"
)

type errorDetail struct {
	Code      string            `json:"code"`
	Message   string            `json:"message"`
	Fields    map[string]string `json:"fields,omitempty"`
	RequestID string            `json:"requestId,omitempty"`
}

type errorBody struct {
	Error errorDetail `json:"error"`
}

// JSON writes any value as a JSON response.
func JSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(v)
}

// RawJSON writes bytes that are already JSON (for example data straight from BC).
func RawJSON(w http.ResponseWriter, status int, raw []byte) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(status)
	_, _ = w.Write(raw)
}

// Error writes the standard error shape every endpoint uses:
// {"error":{"code":"...","message":"...","fields":{...},"requestId":"..."}}
func Error(w http.ResponseWriter, status int, code, message string, fields map[string]string, requestID string) {
	JSON(w, status, errorBody{Error: errorDetail{
		Code:      code,
		Message:   message,
		Fields:    fields,
		RequestID: requestID,
	}})
}
