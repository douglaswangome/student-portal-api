import { Text } from "@mantine/core";
import { createRootRoute, createRoute, createRouter } from "@tanstack/react-router";
import { DEFAULT_PAGE_SIZE, PAGE_SIZES } from "./lib/constants";
import { RootLayout } from "@/components/RootLayout";
import { StudentsPage } from "@/domains/student/pages/Students";
import { StudentDetailPage } from "@/domains/student/pages/StudentDetail";

export type StudentsSearch = {
  search: string;
  page: number;
  pageSize: number;
}

const rootRoute = createRootRoute({
  component: RootLayout,
  notFoundComponent: () => <Text>That page does not exist</Text>
});

const studentsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  validateSearch: (raw: Record<string, unknown>):StudentsSearch => {
    const page = Math.floor(Number(raw.page));
    const pageSize = Number(raw.pageSize);
    return {
      search: raw.search === undefined || raw.search === null ? '' : String(raw.search),
      page: Number.isFinite(page) && page > 0 ? page : 1,
      pageSize: PAGE_SIZES.includes(pageSize) ? pageSize : DEFAULT_PAGE_SIZE,
    }
  },
  component: StudentsPage,
});

const studentRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/students/$studentNo',
  component: StudentDetailPage,
});

const routeTree = rootRoute.addChildren([studentsRoute, studentRoute]);

export const router = createRouter({ routeTree, defaultPreload: "intent" });

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router
  }
}