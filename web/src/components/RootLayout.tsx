import { useRef } from 'react'
import {
  ActionIcon,
  AppShell,
  Container,
  Group,
  Text,
  Tooltip,
  UnstyledButton,
  useComputedColorScheme,
  useMantineColorScheme,
} from '@mantine/core'
import { GraduationCapIcon, MoonIcon, SunIcon } from '@phosphor-icons/react'
import { Outlet, useNavigate, useRouterState } from '@tanstack/react-router'
import gsap from 'gsap'
import { DEFAULT_SEARCH } from '../lib/constants'
import { prefersReducedMotion, useGsapEffect } from '@/lib/motion'

export function RootLayout() {
  const navigate = useNavigate()
  const { setColorScheme } = useMantineColorScheme()
  const scheme = useComputedColorScheme('light', { getInitialValueInEffect: true })

  const pageRef = useRef<HTMLDivElement>(null)
  const themeIconRef = useRef<HTMLSpanElement>(null)

  // Moving between the list and a student fades the new page in. Quick enough
  // to feel like continuity, not a transition you wait through.
  const pathname = useRouterState({ select: (state) => state.location.pathname })
  useGsapEffect(
    pageRef,
    ({ el, reduced }) => {
      gsap.from(el, {
        opacity: 0,
        y: reduced ? 0 : 10,
        duration: reduced ? 0.12 : 0.24,
        ease: 'power3.out',
        clearProps: 'opacity,transform',
      })
    },
    [pathname],
  )

  const toggleScheme = () => {
    setColorScheme(scheme === 'dark' ? 'light' : 'dark')
    if (!prefersReducedMotion() && themeIconRef.current) {
      gsap.fromTo(
        themeIconRef.current,
        { rotate: -70, scale: 0.6, opacity: 0 },
        { rotate: 0, scale: 1, opacity: 1, duration: 0.35, ease: 'expo.out' },
      )
    }
  }

  return (
    <AppShell header={{ height: 56 }} padding="md">
      <AppShell.Header className="app-header">
        <Group h="100%" px="md" justify="space-between" wrap="nowrap">
          <UnstyledButton
            aria-label="Student Registry home"
            onClick={() => void navigate({ to: '/', search: DEFAULT_SEARCH })}
          >
            <Group gap="sm" wrap="nowrap">
              <span className="brand-mark">
                <GraduationCapIcon size={20} weight="fill" />
              </span>
              <div>
                <Text className="brand-name" size="md" lh={1.1}>
                  Student Registry
                </Text>
                <Text className="brand-sub" lh={1.2}>
                  Synced with Business Central
                </Text>
              </div>
            </Group>
          </UnstyledButton>

          <Tooltip label={scheme === 'dark' ? 'Switch to light' : 'Switch to dark'}>
            <ActionIcon
              className="shell-icon-button"
              variant="subtle"
              size="lg"
              aria-label="Toggle color scheme"
              onClick={toggleScheme}
            >
              <span ref={themeIconRef} style={{ display: 'grid', placeItems: 'center' }}>
                {scheme === 'dark' ? <SunIcon size={18} /> : <MoonIcon size={18} />}
              </span>
            </ActionIcon>
          </Tooltip>
        </Group>
      </AppShell.Header>

      <AppShell.Main>
        <Container size="xl" py="md">
          <div ref={pageRef}>
            <Outlet />
          </div>
        </Container>
      </AppShell.Main>
    </AppShell>
  );
}