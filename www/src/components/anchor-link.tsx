'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { type ComponentProps } from 'react';

type AnchorLinkProps = ComponentProps<typeof Link>;

export function AnchorLink({ href, onClick, ...props }: AnchorLinkProps) {
  const pathname = usePathname();

  const handleClick = (e: React.MouseEvent<HTMLAnchorElement>) => {
    const hrefString = href.toString();
    const [path, hash] = hrefString.split('#');

    // Check if we're on the same page and there's a hash
    if (hash && (path === pathname || path === '')) {
      e.preventDefault();
      const element = document.getElementById(hash);
      if (element) {
        element.scrollIntoView({ behavior: 'smooth' });
        // Update URL hash without navigation
        window.history.pushState(null, '', `#${hash}`);
      }
    }

    onClick?.(e);
  };

  return <Link href={href} onClick={handleClick} {...props} />;
}
