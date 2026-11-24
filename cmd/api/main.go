package main

import (
	"context"
	"errors"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
	"github.com/go-chi/cors"
	"github.com/joho/godotenv"

	"student-portal-api/internal/bc"
	"student-portal-api/internal/config"
	"student-portal-api/internal/httpx"
	"student-portal-api/internal/students"
)

func main() {
	log := slog.New(slog.NewJSONHandler(os.Stdout, nil))

	_ = godotenv.Load()

	cfg, err := config.Load()
	if err != nil {
		log.Error("invalid configuration", "error", err)
		os.Exit(1)
	}

	client := bc.NewClient(cfg.BCBaseURL, cfg.BCInstance, cfg.BCCompany, cfg.BCService, cfg.BCUser, cfg.BCPassword)
	handler := students.NewHandler(client, log)

	r := chi.NewRouter()
	r.Use(middleware.RequestID)
	r.Use(middleware.Logger)
	r.Use(middleware.Recoverer) // a panic becomes a 500 instead of crashing the server
	r.Use(middleware.Timeout(45 * time.Second))
	r.Use(cors.Handler(cors.Options{
		AllowedOrigins: []string{cfg.AllowedOrigin}, // only your React app may call this API
		AllowedMethods: []string{"GET", "POST", "PATCH", "OPTIONS"},
		AllowedHeaders: []string{"Accept", "Content-Type"},
		MaxAge:         300,
	}))

	r.Get("/healthz", func(w http.ResponseWriter, r *http.Request) {
		httpx.JSON(w, http.StatusOK, map[string]string{"status": "ok"})
	})
	// readyz also proves Business Central is reachable
	r.Get("/readyz", func(w http.ResponseWriter, r *http.Request) {
		if err := handler.Ping(r.Context()); err != nil {
			log.Error("readiness check failed", "error", err)
			httpx.Error(w, http.StatusServiceUnavailable, "NOT_READY", "Business Central is not reachable.", nil, middleware.GetReqID(r.Context()))
			return
		}
		httpx.JSON(w, http.StatusOK, map[string]string{"status": "ready"})
	})

	r.Route("/api/v1", func(r chi.Router) {
		r.Get("/lookups", handler.Lookups)
		r.Route("/students", func(r chi.Router) {
			r.Get("/", handler.List)
			r.Post("/", handler.Create)
			r.Get("/{studentNo}", handler.Get)
			r.Patch("/{studentNo}", handler.Update)
			r.Get("/{studentNo}/fee-statement", handler.FeeStatement)
		})
	})

	srv := &http.Server{
		Addr:              ":" + cfg.Port,
		Handler:           r,
		ReadHeaderTimeout: 10 * time.Second,
		ReadTimeout:       30 * time.Second,
		WriteTimeout:      60 * time.Second,
		IdleTimeout:       120 * time.Second,
	}

	// Graceful shutdown: on Ctrl+C finish in-flight requests before exiting.
	go func() {
		log.Info("server starting", "addr", srv.Addr, "bcCompany", cfg.BCCompany, "bcService", cfg.BCService)
		if err := srv.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
			log.Error("server failed", "error", err)
			os.Exit(1)
		}
	}()

	stop := make(chan os.Signal, 1)
	signal.Notify(stop, os.Interrupt, syscall.SIGTERM)
	<-stop
	log.Info("shutting down")

	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()
	_ = srv.Shutdown(ctx)
}
