import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { ApiError } from "@/api/client";
import { MantineProvider } from "@mantine/core";
import { theme } from "@/theme";
import { Notifications } from "@mantine/notifications";
import { RouterProvider } from "@tanstack/react-router";
import { router } from "@/router";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      staleTime: 1000 * 60 * 5, // 5 minutes
      retry: (failureCount, error) => {
        if (error instanceof ApiError && error.status >= 400 && error.status < 500) {
          return false; // Don't retry for client errors (4xx)
        }
        return failureCount < 1; // Retry once for client errors
      },
    },
  },
});

export function App() {
  return (
    <MantineProvider theme={theme} defaultColorScheme="auto">
      <Notifications position={"top-right"}/>
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>
    </MantineProvider>
  )
}