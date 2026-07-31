import { NextResponse, type NextRequest } from 'next/server'
import { SESSION_COOKIE } from '@/lib/auth/types'

const PUBLIC_PATHS = ['/login', '/api/auth/login', '/api/auth/guest']

function isPublic(pathname: string): boolean {
  if (PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`))) return true
  if (pathname.startsWith('/_next')) return true
  if (pathname.startsWith('/favicon')) return true
  return false
}

function studentShowcaseEnabled(): boolean {
  const raw =
    process.env.NEXT_PUBLIC_STUDENT_SHOWCASE ?? process.env.STUDENT_SHOWCASE
  if (raw === undefined || raw === '') return true
  return raw !== 'false' && raw !== '0'
}

/**
 * Edge middleware: cookie presence check only.
 * Signature + role enforcement happen server-side in API/page guards.
 * Student showcase: no cookie → mint guest session via /api/auth/guest.
 */
export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl
  if (isPublic(pathname)) return NextResponse.next()

  const token = request.cookies.get(SESSION_COOKIE)?.value
  if (!token) {
    if (studentShowcaseEnabled()) {
      // Pages: mint a guest cookie. APIs: continue — getSession synthesizes a guest.
      if (pathname.startsWith('/api/')) {
        return NextResponse.next()
      }
      const guest = new URL('/api/auth/guest', request.url)
      guest.searchParams.set('next', pathname)
      return NextResponse.redirect(guest)
    }

    if (pathname.startsWith('/api/')) {
      return NextResponse.json(
        { error: 'Sign in required', code: 'unauthorized' },
        { status: 401 },
      )
    }
    const login = new URL('/login', request.url)
    login.searchParams.set('next', pathname)
    return NextResponse.redirect(login)
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
}
