export const SEO_SITE_URL = 'https://dinkcard.et';
export const SEO_BRAND_NAME = 'Dink Card';
export const SEO_LOGO_URL = `${SEO_SITE_URL}/dink-card-logo.png`;
export const SEO_OG_IMAGE_URL = `${SEO_SITE_URL}/og-image.svg`;

export const SEO_KEYWORDS = [
  'Dink Card',
  'virtual card Ethiopia',
  'Visa card Ethiopia',
  'online payment Ethiopia',
  'digital payment Ethiopia',
  'subscription payment Ethiopia'
];

export const PUBLIC_NAV_LINKS = [
  { label: 'Home', path: '/' },
  { label: 'Services', path: '/services' },
  { label: 'About', path: '/about' },
  { label: 'Contact', path: '/contact' },
  { label: 'Login', path: '/login' },
  { label: 'Privacy Policy', path: '/privacy-policy' },
  { label: 'Terms', path: '/terms' }
];

export const NOINDEX_PATH_PREFIXES = [
  '/login',
  '/register',
  '/forgot-password',
  '/reset-password',
  '/dashboard',
  '/admin',
  '/superadmin',
  '/account',
  '/wallet',
  '/cards',
  '/transactions',
  '/kyc',
  '/support',
  '/notifications',
  '/add-money'
];

export const SEO_PAGES = {
  '/': {
    title: 'Dink Card - Virtual USD Card Solution in Ethiopia',
    description: 'Dink Card helps users in Ethiopia request and manage virtual USD card services for online payments, subscriptions, and digital services with a simple and secure experience.',
    canonicalPath: '/',
    type: 'website'
  },
  '/login': {
    title: 'Login - Dink Card',
    description: 'Log in to your Dink Card account to manage your virtual card, balance, transactions, and digital payment services.',
    canonicalPath: '/login',
    type: 'website',
    robots: 'noindex, follow'
  },
  '/register': {
    title: 'Create Account - Dink Card',
    description: 'Create a Dink Card account to start verification and access supported virtual card services for online payments in Ethiopia.',
    canonicalPath: '/register',
    type: 'website',
    robots: 'noindex, follow'
  },
  '/services': {
    title: 'Services - Dink Card',
    description: 'Explore Dink Card services for virtual cards, online payments, subscription payments, and digital service access in Ethiopia.',
    canonicalPath: '/services',
    type: 'website'
  },
  '/about': {
    title: 'About - Dink Card',
    description: 'Learn about Dink Card, a digital payment platform helping Ethiopian users access secure online payment and virtual card services.',
    canonicalPath: '/about',
    type: 'website'
  },
  '/contact': {
    title: 'Contact - Dink Card',
    description: 'Contact the Dink Card support team for help with your account, virtual card, payments, and digital services.',
    canonicalPath: '/contact',
    type: 'website'
  },
  '/privacy-policy': {
    title: 'Privacy Policy - Dink Card',
    description: 'Read the Dink Card privacy policy to understand how user data, account information, and payment-related information are handled.',
    canonicalPath: '/privacy-policy',
    type: 'article'
  },
  '/privacy': {
    title: 'Privacy Policy - Dink Card',
    description: 'Read the Dink Card privacy policy to understand how user data, account information, and payment-related information are handled.',
    canonicalPath: '/privacy-policy',
    type: 'article'
  },
  '/terms': {
    title: 'Terms and Conditions - Dink Card',
    description: 'Read the Dink Card terms and conditions for using virtual card, payment, and digital service features.',
    canonicalPath: '/terms',
    type: 'article'
  }
};

export function normalizeSeoPath(pathname = '/') {
  const clean = String(pathname || '/').split('?')[0].split('#')[0].replace(/\/+$/, '');
  return clean || '/';
}

export function absoluteUrl(path = '/') {
  return `${SEO_SITE_URL}${path.startsWith('/') ? path : `/${path}`}`;
}

export function getSeoForPath(pathname = '/') {
  const normalizedPath = normalizeSeoPath(pathname);
  const page = SEO_PAGES[normalizedPath] || SEO_PAGES['/'];
  const isNoindex = NOINDEX_PATH_PREFIXES.some((prefix) => normalizedPath === prefix || normalizedPath.startsWith(`${prefix}/`));
  return {
    keywords: SEO_KEYWORDS,
    image: SEO_OG_IMAGE_URL,
    url: absoluteUrl(page.canonicalPath || normalizedPath),
    robots: isNoindex ? 'noindex, follow' : 'index, follow',
    ...page
  };
}

export function buildSeoStructuredData() {
  return [
    {
      '@context': 'https://schema.org',
      '@type': 'Organization',
      name: SEO_BRAND_NAME,
      url: SEO_SITE_URL,
      logo: SEO_LOGO_URL,
      sameAs: []
    },
    {
      '@context': 'https://schema.org',
      '@type': 'WebSite',
      name: SEO_BRAND_NAME,
      alternateName: 'DinkCard',
      url: SEO_SITE_URL
    },
    {
      '@context': 'https://schema.org',
      '@type': 'SoftwareApplication',
      name: SEO_BRAND_NAME,
      applicationCategory: 'FinanceApplication',
      operatingSystem: 'Web, Android, iOS',
      url: SEO_SITE_URL,
      image: SEO_OG_IMAGE_URL,
      description: SEO_PAGES['/'].description,
      offers: {
        '@type': 'Offer',
        price: '0',
        priceCurrency: 'ETB'
      }
    }
  ];
}
