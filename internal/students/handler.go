package students

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"log/slog"
	"net/http"
	"net/url"
	"regexp"
	"strconv"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"

	"student-portal-api/internal/bc"
	"student-portal-api/internal/httpx"
)

type Handler struct {
	bc  *bc.Client
	log *slog.Logger
}

func NewHandler(client *bc.Client, log *slog.Logger) *Handler {
	return &Handler{bc: client, log: log}
}

// input is what the browser may send. Every field is a POINTER so we can tell
// "not sent" (nil, leave unchanged) apart from "sent as empty" (clear it).
// omitempty drops nil pointers when we forward the JSON on to BC.
type input struct {
	FirstName      *string `json:"firstName,omitempty"`
	MiddleName     *string `json:"middleName,omitempty"`
	LastName       *string `json:"lastName,omitempty"`
	Gender         *string `json:"gender,omitempty"`
	DateOfBirth    *string `json:"dateOfBirth,omitempty"`
	IDNumber       *string `json:"idNumber,omitempty"`
	Nationality    *string `json:"nationality,omitempty"`
	County         *string `json:"county,omitempty"`
	Phone          *string `json:"phone,omitempty"`
	AlternatePhone *string `json:"alternatePhone,omitempty"`
	Email          *string `json:"email,omitempty"`
	PostalAddress  *string `json:"postalAddress,omitempty"`
	Version        *string `json:"version,omitempty"`
}

var (
	emailRe = regexp.MustCompile(`^[^@\s]+@[^@\s]+\.[^@\s]+$`)
	phoneRe = regexp.MustCompile(`^\+?[0-9]{9,15}$`)
)

// GET /api/v1/students?search=&page=1&pageSize=25
func (h *Handler) List(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()
	search := strings.TrimSpace(q.Get("search"))
	page := intParam(q.Get("page"), 1, 1, 1_000_000)
	pageSize := intParam(q.Get("pageSize"), 25, 1, 100)

	if search != "" && len([]rune(search)) < 2 {
		h.respondError(w, r, http.StatusUnprocessableEntity, "VALIDATION_ERROR",
			"The search text is too short.", map[string]string{"search": "Type at least 2 characters to search."})
		return
	}

	data, err := h.bc.Call(r.Context(), "ListStudents",
		bc.Param{Name: "search", Value: search},
		bc.Param{Name: "skip", Value: strconv.Itoa((page - 1) * pageSize)},
		bc.Param{Name: "top", Value: strconv.Itoa(pageSize)},
	)
	if err != nil {
		h.fail(w, r, err)
		return
	}

	var list struct {
		Total int             `json:"total"`
		Items json.RawMessage `json:"items"`
	}
	if err := json.Unmarshal(data, &list); err != nil {
		h.fail(w, r, &bc.UpstreamError{Kind: "protocol", Detail: "list data: " + err.Error()})
		return
	}
	httpx.JSON(w, http.StatusOK, map[string]any{
		"items":    list.Items,
		"total":    list.Total,
		"page":     page,
		"pageSize": pageSize,
	})
}

// GET /api/v1/students/{studentNo}
func (h *Handler) Get(w http.ResponseWriter, r *http.Request) {
	no, ok := h.studentNo(w, r)
	if !ok {
		return
	}
	data, err := h.bc.Call(r.Context(), "GetStudent", bc.Param{Name: "studentNo", Value: no})
	if err != nil {
		h.fail(w, r, err)
		return
	}
	httpx.RawJSON(w, http.StatusOK, data)
}

// POST /api/v1/students
func (h *Handler) Create(w http.ResponseWriter, r *http.Request) {
	in, ok := h.decode(w, r)
	if !ok {
		return
	}
	in.Version = nil // a new student has no version
	if problems := validate(in, true); len(problems) > 0 {
		h.respondError(w, r, http.StatusUnprocessableEntity, "VALIDATION_ERROR",
			"Please correct the highlighted fields.", problems)
		return
	}

	payload, _ := json.Marshal(in)
	data, err := h.bc.Call(r.Context(), "RegisterStudent", bc.Param{Name: "payload", Value: string(payload)})
	if err != nil {
		h.fail(w, r, err)
		return
	}

	var created struct {
		StudentNo string `json:"studentNo"`
	}
	_ = json.Unmarshal(data, &created)
	if created.StudentNo != "" {
		w.Header().Set("Location", "/api/v1/students/"+url.PathEscape(created.StudentNo))
	}
	httpx.RawJSON(w, http.StatusCreated, data)
}

// PATCH /api/v1/students/{studentNo}
// Send only the properties that changed, plus "version" from the last read.
func (h *Handler) Update(w http.ResponseWriter, r *http.Request) {
	no, ok := h.studentNo(w, r)
	if !ok {
		return
	}
	in, ok := h.decode(w, r)
	if !ok {
		return
	}
	problems := validate(in, false)
	if in.Version == nil || *in.Version == "" {
		problems["version"] = "The version from the last read is required."
	}
	if len(problems) > 0 {
		h.respondError(w, r, http.StatusUnprocessableEntity, "VALIDATION_ERROR",
			"Please correct the highlighted fields.", problems)
		return
	}

	payload, _ := json.Marshal(in)
	data, err := h.bc.Call(r.Context(), "UpdateStudent",
		bc.Param{Name: "studentNo", Value: no},
		bc.Param{Name: "payload", Value: string(payload)},
	)
	if err != nil {
		h.fail(w, r, err)
		return
	}
	httpx.RawJSON(w, http.StatusOK, data)
}

// GET /api/v1/lookups  (nationality and county dropdown data)
func (h *Handler) Lookups(w http.ResponseWriter, r *http.Request) {
	data, err := h.bc.Call(r.Context(), "GetLookups")
	if err != nil {
		h.fail(w, r, err)
		return
	}
	httpx.RawJSON(w, http.StatusOK, data)
}

// Ping is used by /readyz to check that BC is reachable.
func (h *Handler) Ping(ctx context.Context) error {
	ctx, cancel := context.WithTimeout(ctx, 10*time.Second)
	defer cancel()
	_, err := h.bc.Call(ctx, "Ping")
	// Ping returns plain text, not our JSON envelope, so a "protocol" complaint
	// about the envelope still proves BC answered. Only real connection or
	// credential problems count as not ready.
	var up *bc.UpstreamError
	if errors.As(err, &up) && (up.Kind == "unavailable" || up.Kind == "auth" || up.Kind == "fault") {
		return err
	}
	return nil
}

// helpers

// studentNo reads {studentNo} from the URL. Numbers may contain "/" in some
// universities, so clients should URL-encode it (%2F); we decode it here.
func (h *Handler) studentNo(w http.ResponseWriter, r *http.Request) (string, bool) {
	raw := chi.URLParam(r, "studentNo")
	no, err := url.PathUnescape(raw)
	no = strings.TrimSpace(no)
	if err != nil || no == "" || len(no) > 20 || strings.ContainsAny(no, "\r\n\t") {
		h.respondError(w, r, http.StatusBadRequest, "BAD_REQUEST", "The student number is not valid.", nil)
		return "", false
	}
	return no, true
}

// decode reads the JSON body strictly: it limits the size and REJECTS unknown
// properties, so a client cannot try to set fields like status or balance.
func (h *Handler) decode(w http.ResponseWriter, r *http.Request) (*input, bool) {
	r.Body = http.MaxBytesReader(w, r.Body, 1<<20)
	dec := json.NewDecoder(r.Body)
	dec.DisallowUnknownFields()

	var in input
	if err := dec.Decode(&in); err != nil {
		msg := "The request body is not valid JSON."
		if strings.HasPrefix(err.Error(), "json: unknown field") {
			msg = "The request contains a property that is not allowed: " + strings.TrimPrefix(err.Error(), "json: unknown field ")
		}
		h.respondError(w, r, http.StatusBadRequest, "BAD_REQUEST", msg, nil)
		return nil, false
	}
	if err := dec.Decode(&struct{}{}); !errors.Is(err, io.EOF) {
		h.respondError(w, r, http.StatusBadRequest, "BAD_REQUEST", "The request body must contain a single JSON object.", nil)
		return nil, false
	}
	normalize(&in)
	return &in, true
}

// normalize trims spaces from every text value that was sent.
func normalize(in *input) {
	for _, p := range []*string{
		in.FirstName, in.MiddleName, in.LastName, in.Gender, in.DateOfBirth, in.IDNumber,
		in.Nationality, in.County, in.Phone, in.AlternatePhone, in.Email, in.PostalAddress, in.Version,
	} {
		if p != nil {
			*p = strings.TrimSpace(*p)
		}
	}
}

// validate is the quick "shape" check done before BC is called. The detailed
// business rules (age limit, duplicate ID number, valid county code...) live in
// the AL code, which is the single source of truth.
func validate(in *input, create bool) map[string]string {
	problems := map[string]string{}

	if create {
		requireText(problems, "firstName", in.FirstName, "First name is required.")
		requireText(problems, "lastName", in.LastName, "Last name is required.")
		requireText(problems, "gender", in.Gender, "Gender is required.")
		requireText(problems, "dateOfBirth", in.DateOfBirth, "Date of birth is required.")
		requireText(problems, "idNumber", in.IDNumber, "ID number is required.")
		requireText(problems, "phone", in.Phone, "Phone number is required.")
	}

	if in.Gender != nil && *in.Gender != "" {
		g := strings.ToLower(*in.Gender)
		if g != "male" && g != "female" {
			problems["gender"] = "Choose Male or Female."
		}
	}
	if in.DateOfBirth != nil && *in.DateOfBirth != "" {
		if _, err := time.Parse("2006-01-02", *in.DateOfBirth); err != nil {
			problems["dateOfBirth"] = "Use the format YYYY-MM-DD."
		}
	}
	if in.Phone != nil && *in.Phone != "" && !phoneRe.MatchString(stripPhone(*in.Phone)) {
		problems["phone"] = "Enter a valid phone number, for example 0712345678 or +254712345678."
	}
	if in.AlternatePhone != nil && *in.AlternatePhone != "" && !phoneRe.MatchString(stripPhone(*in.AlternatePhone)) {
		problems["alternatePhone"] = "Enter a valid phone number."
	}
	if in.Email != nil && *in.Email != "" && !emailRe.MatchString(*in.Email) {
		problems["email"] = "Enter a valid email address."
	}
	return problems
}

func requireText(problems map[string]string, field string, value *string, message string) {
	if value == nil || *value == "" {
		problems[field] = message
	}
}

func stripPhone(s string) string {
	return strings.NewReplacer(" ", "", "-", "", "(", "", ")", "").Replace(s)
}

func intParam(raw string, def, min, max int) int {
	n, err := strconv.Atoi(raw)
	if err != nil {
		return def
	}
	if n < min {
		return min
	}
	if n > max {
		return max
	}
	return n
}

// fail turns an error from the BC client into the right HTTP response.
func (h *Handler) fail(w http.ResponseWriter, r *http.Request, err error) {
	// 1) A business error produced by our AL code: safe to show.
	var apiErr *bc.APIError
	if errors.As(err, &apiErr) {
		h.respondError(w, r, statusFor(apiErr.Code), apiErr.Code, apiErr.Message, apiErr.Fields)
		return
	}

	// 2) Anything else is a problem between us and BC. Log the detail, and show
	// the user only a generic message plus a request ID they can quote to support.
	var up *bc.UpstreamError
	if errors.As(err, &up) {
		h.log.Error("business central call failed",
			"kind", up.Kind, "detail", up.Detail,
			"requestId", middleware.GetReqID(r.Context()), "path", r.URL.Path)
	} else {
		h.log.Error("unexpected error", "error", err, "requestId", middleware.GetReqID(r.Context()))
	}
	h.respondError(w, r, http.StatusBadGateway, "UPSTREAM_ERROR",
		"The student system (Business Central) could not complete the request. Please try again.", nil)
}

func statusFor(code string) int {
	switch code {
	case "VALIDATION_ERROR":
		return http.StatusUnprocessableEntity // 422
	case "NOT_FOUND":
		return http.StatusNotFound // 404
	case "CONFLICT":
		return http.StatusConflict // 409
	case "BAD_REQUEST":
		return http.StatusBadRequest // 400
	default:
		return http.StatusBadGateway
	}
}

func (h *Handler) respondError(w http.ResponseWriter, r *http.Request, status int, code, message string, fields map[string]string) {
	httpx.Error(w, status, code, message, fields, middleware.GetReqID(r.Context()))
}
