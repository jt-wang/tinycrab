'use client';

import { useLocale } from 'next-intl';
import { usePathname } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { locales, localeNames, type Locale } from '@/i18n/config';
import { Globe } from 'lucide-react';
import { useState, useRef, useEffect } from 'react';
import Link from 'next/link';

export function LanguageSwitcher() {
  const locale = useLocale() as Locale;
  const pathname = usePathname();
  const [isOpen, setIsOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (ref.current && !ref.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  function getLocalePath(newLocale: Locale): string {
    // Remove any existing locale prefix
    const pathWithoutLocale = pathname.replace(/^\/(en|zh)/, '') || '/';
    // Always include locale prefix
    return `/${newLocale}${pathWithoutLocale}`;
  }

  return (
    <div className="relative" ref={ref}>
      <Button
        variant="ghost"
        size="sm"
        onClick={() => setIsOpen(!isOpen)}
        className="gap-2 text-muted-foreground hover:text-foreground cursor-pointer"
      >
        <Globe className="w-4 h-4" />
        <span className="text-sm">{localeNames[locale]}</span>
      </Button>

      {isOpen && (
        <div className="absolute right-0 mt-2 w-32 rounded-lg border border-border bg-popover shadow-lg overflow-hidden z-50">
          {locales.map((loc) => (
            <Link
              key={loc}
              href={getLocalePath(loc)}
              locale={loc}
              onClick={() => setIsOpen(false)}
              className={`block w-full px-4 py-2.5 text-left text-sm transition-colors hover:bg-accent ${
                locale === loc ? 'text-crab bg-accent/50' : 'text-popover-foreground'
              }`}
            >
              {localeNames[loc]}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
