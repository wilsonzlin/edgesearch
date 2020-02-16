import React from 'react';

export const ExternalLink = ({
  className,
  href,
  children,
}: {
  className?: string,
  href: string,
  children: React.ReactNode | React.ReactNodeArray,
}) => (
  <a className={className} href={href} target="_blank" rel="nofollow noopener noreferrer">{children}</a>
);
