package service

import (
	"context"
	"net/http"
	"time"
)

func Client() *http.Client {
	return &http.Client{}
}

func Work(ctx context.Context) error {
	ctx, cancel := context.WithTimeout(context.Background(), 50*time.Millisecond)
	defer cancel()
	<-ctx.Done()
	return ctx.Err()
}

func Retry(attempt int) time.Duration {
	return time.Duration(1<<attempt) * time.Second
}
