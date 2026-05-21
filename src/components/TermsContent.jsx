import React from 'react';
import { TERMS_VERSION, policies } from '@/lib/legal';

export { TERMS_VERSION };

export default function TermsContent() {
  const terms = policies.terms;

  return (
    <div className="text-sm text-muted-foreground space-y-4 pr-2">
      <p className="font-semibold text-foreground text-base">{terms.title} ({TERMS_VERSION})</p>
      {terms.intro.map((paragraph) => (
        <p key={paragraph}>{paragraph}</p>
      ))}

      {terms.sections.map(([title, body], index) => (
        <section key={title}>
          <h3 className="font-semibold text-foreground mb-1">{index + 1}. {title}</h3>
          <p>{body}</p>
        </section>
      ))}

      <div className="pt-2 border-t border-border text-xs">
        By clicking "I Agree", you confirm that you have read, understood, and agree to be legally bound by these Terms & Conditions.
      </div>
    </div>
  );
}
