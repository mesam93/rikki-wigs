import { useState } from 'react';
import { Link, useLocation } from 'wouter';
import { Menu } from 'lucide-react';
import { useClerk } from '@clerk/react';

function AdminLogoutButton() {
  return <a href="/client/sign-out" className="rounded-full border border-white/35 px-4 py-2 text-sm font-semibold text-white hover:bg-white hover:text-black">Log out</a>;
}

function ClientLogoutButton() {
  const { signOut } = useClerk();
  return <button type="button" onClick={() => void signOut({ redirectUrl: '/' })} className="rounded-full border border-white/35 px-4 py-2 text-sm font-semibold text-white hover:bg-white hover:text-black">Log out</button>;
}

export function SiteNav({ manage = false, isClientAccount = false }: { manage?: boolean; isClientAccount?: boolean }) {
  const [menuOpen, setMenuOpen] = useState(false);
  return (
    <header className="relative z-20 border-b border-[hsl(var(--sidebar-border))] bg-[hsl(var(--sidebar))] text-[hsl(var(--sidebar-foreground))]">
      <div className="container-rikki flex items-center justify-between py-4 md:py-3">
        <Link href="~/" className="flex w-24 items-center leading-none md:w-1/3" data-testid="link-home-logo" aria-label="Rikki Wigs home">
          <img src="/brand/rikki-header-wordmark.svg" alt="" className="w-full object-contain md:max-w-[180px] xl:max-w-[210px]" />
        </Link>
        <nav className="hidden items-center justify-center gap-9 md:flex md:flex-1" aria-label="Primary navigation">
          {manage || isClientAccount ? <Link href="~/" className="editorial-link text-base opacity-80 hover:opacity-100" data-testid="link-public-site">View public site</Link> : <>
             <a href="/#services" className="editorial-link text-base" data-testid="link-services">Services</a>
             <a href="/#testimonials" className="editorial-link text-base" data-testid="link-testimonials">Testimonials</a>
             <a href="/#gallery" className="editorial-link text-base" data-testid="link-gallery">Gallery</a>
             <Link href="~/book" className="whitespace-nowrap rounded-full bg-[hsl(var(--accent))] px-5 py-2.5 text-sm font-semibold !text-[hsl(var(--foreground))] transition-colors hover:bg-white" data-testid="link-nav-book">Book appointment</Link>
          </>}
        </nav>
        <div className="flex items-center gap-3 md:w-1/3 md:justify-end">
          {(!manage && !isClientAccount) && <Link href="~/login" className="hidden rounded-full border border-white bg-white px-5 py-2.5 text-sm font-semibold !text-black transition-colors hover:bg-black hover:!text-white sm:inline-flex" data-testid="link-login">Log in</Link>}
          {manage && <AdminLogoutButton />}
          {isClientAccount && <ClientLogoutButton />}
          <button className="rounded-full border border-current/20 p-2 md:hidden" onClick={() => setMenuOpen(!menuOpen)} aria-label="Open menu" data-testid="button-mobile-menu"><Menu size={19} /></button>
        </div>
      </div>
      {menuOpen && <div className="container-rikki pb-5 md:hidden">
        <div className="flex flex-col gap-4 border-t border-current/15 pt-4 text-sm">
          {(!manage && !isClientAccount) && <><a href="/#services" onClick={() => setMenuOpen(false)} data-testid="link-mobile-services">Services</a><a href="/#testimonials" onClick={() => setMenuOpen(false)} data-testid="link-mobile-testimonials">Testimonials</a><a href="/#gallery" onClick={() => setMenuOpen(false)} data-testid="link-mobile-gallery">Gallery</a><Link href="~/book" onClick={() => setMenuOpen(false)} className="w-fit rounded-full bg-[hsl(var(--accent))] px-4 py-2 font-semibold text-[hsl(var(--foreground))]">Book appointment</Link><Link href="~/login" onClick={() => setMenuOpen(false)}>Log in</Link></>}
          {(manage || isClientAccount) && <Link href="~/" onClick={() => setMenuOpen(false)} data-testid="link-mobile-action">View public site</Link>}
        </div>
      </div>}
    </header>
  );
}