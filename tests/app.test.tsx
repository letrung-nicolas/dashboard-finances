import { describe, expect, it } from 'vitest';
import { renderToString } from 'react-dom/server';
import { StaticRouter } from 'react-router-dom/server';
import { App } from '../src/app/App';

describe('App', () => {
  it("affiche l'accueil en français", () => {
    const html = renderToString(
      <StaticRouter location="/">
        <App />
      </StaticRouter>,
    );
    expect(html).toContain('Finances');
    expect(html).toContain('100 % locale');
  });

  it("affiche la page de mesure de vitesse du chiffrement", () => {
    const html = renderToString(
      <StaticRouter location="/outils/crypto">
        <App />
      </StaticRouter>,
    );
    expect(html).toContain("Vitesse du chiffrement");
    expect(html).toContain("Mesurer");
  });
});
