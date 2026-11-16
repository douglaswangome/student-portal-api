// Package config reads settings from environment variables so that secrets
// (like the BC password) never live in the source code.
package config

import (
	"fmt"
	"os"
	"strings"
)

type Config struct {
	Port          string
	AllowedOrigin string

	BCBaseURL  string
	BCInstance string
	BCCompany  string
	BCService  string
	BCUser     string
	BCPassword string
}

// Load reads and validates the configuration. It fails fast with a clear message
// so a missing setting is found at start-up, not in the middle of a request.
func Load() (Config, error) {
	cfg := Config{
		Port:          getenv("PORT", "8081"),
		AllowedOrigin: getenv("ALLOWED_ORIGIN", "http://localhost:5173"),
		BCBaseURL:     strings.TrimRight(os.Getenv("BC_BASE_URL"), "/"),
		BCInstance:    getenv("BC_INSTANCE", "BC200"),
		BCCompany:     getenv("BC_COMPANY", "TEST"),
		BCService:     getenv("BC_SERVICE", "DWStudentService"),
		BCUser:        os.Getenv("BC_USER"),
		BCPassword:    os.Getenv("BC_PASSWORD"),
	}

	var missing []string
	if cfg.BCBaseURL == "" {
		missing = append(missing, "BC_BASE_URL")
	}
	if cfg.BCUser == "" {
		missing = append(missing, "BC_USER")
	}
	if cfg.BCPassword == "" {
		missing = append(missing, "BC_PASSWORD")
	}
	if len(missing) > 0 {
		return Config{}, fmt.Errorf("missing required environment variables: %s", strings.Join(missing, ", "))
	}
	return cfg, nil
}

func getenv(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}
