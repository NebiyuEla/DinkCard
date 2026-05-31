import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { buildSeoStructuredData, getSeoForPath, SEO_BRAND_NAME } from '@/lib/seo';

function upsertMeta(selector, attributes) {
  let element = document.head.querySelector(selector);
  if (!element) {
    element = document.createElement('meta');
    document.head.appendChild(element);
  }
  Object.entries(attributes).forEach(([key, value]) => {
    element.setAttribute(key, value);
  });
}

function upsertLink(selector, attributes) {
  let element = document.head.querySelector(selector);
  if (!element) {
    element = document.createElement('link');
    document.head.appendChild(element);
  }
  Object.entries(attributes).forEach(([key, value]) => {
    element.setAttribute(key, value);
  });
}

function upsertJsonLd(id, payload) {
  let element = document.getElementById(id);
  if (!element) {
    element = document.createElement('script');
    element.id = id;
    element.type = 'application/ld+json';
    document.head.appendChild(element);
  }
  element.textContent = JSON.stringify(payload);
}

export default function SEO() {
  const location = useLocation();

  useEffect(() => {
    const page = getSeoForPath(location.pathname);
    document.title = page.title;

    upsertMeta('meta[name="description"]', { name: 'description', content: page.description });
    upsertMeta('meta[name="keywords"]', { name: 'keywords', content: page.keywords.join(', ') });
    upsertMeta('meta[name="application-name"]', { name: 'application-name', content: SEO_BRAND_NAME });
    upsertMeta('meta[name="robots"]', { name: 'robots', content: page.robots || 'index, follow' });

    upsertMeta('meta[property="og:title"]', { property: 'og:title', content: page.title });
    upsertMeta('meta[property="og:description"]', { property: 'og:description', content: page.description });
    upsertMeta('meta[property="og:type"]', { property: 'og:type', content: page.type });
    upsertMeta('meta[property="og:url"]', { property: 'og:url', content: page.url });
    upsertMeta('meta[property="og:image"]', { property: 'og:image', content: page.image });
    upsertMeta('meta[property="og:site_name"]', { property: 'og:site_name', content: SEO_BRAND_NAME });

    upsertMeta('meta[name="twitter:card"]', { name: 'twitter:card', content: 'summary_large_image' });
    upsertMeta('meta[name="twitter:title"]', { name: 'twitter:title', content: page.title });
    upsertMeta('meta[name="twitter:description"]', { name: 'twitter:description', content: page.description });
    upsertMeta('meta[name="twitter:image"]', { name: 'twitter:image', content: page.image });

    upsertLink('link[rel="canonical"]', { rel: 'canonical', href: page.url });

    buildSeoStructuredData().forEach((schema, index) => {
      upsertJsonLd(`seo-jsonld-${index}`, schema);
    });
  }, [location.pathname]);

  return null;
}
