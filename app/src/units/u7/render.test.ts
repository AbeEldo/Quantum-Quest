/**
 * Smoke test: server-render every World 7 lesson, widget and game to catch render-time
 * exceptions (bad props, undefined access, MDX/JSX mistakes). Effects (three.js, canvas,
 * animation frames) don't run during SSR, so this only covers the initial render.
 */
import { describe, it, expect } from 'vitest';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { MDXProvider } from '@mdx-js/react';
import { mdxComponents } from '../../components/mdx';
import { unit } from './index';

const Step = ({ children }: { children?: React.ReactNode }) => React.createElement('section', null, children);
const components = { ...mdxComponents, Step } as Record<string, unknown>;

function render(el: React.ReactElement): string {
  return renderToString(React.createElement(MDXProvider, { components: components as never }, el));
}

describe('World 7 renders without throwing', () => {
  for (const lesson of unit.lessons) {
    it(`lesson ${lesson.id}`, async () => {
      const mod = await lesson.load();
      const html = render(React.createElement(mod.default, { components }));
      expect(html.length).toBeGreaterThan(5000);
      expect(html).not.toMatch(/katex-error/);
    });
  }

  it('widgets', async () => {
    const mods = await Promise.all([
      import('./widgets/EulerDecomposer'),
      import('./widgets/TwoQubitGateExplorer'),
      import('./widgets/IdentityChecker'),
      import('./widgets/KickbackClocks'),
      import('./widgets/HTCoverage'),
      import('./widgets/GarbageDemo'),
    ]);
    const comps = [mods[0].EulerDecomposer, mods[1].TwoQubitGateExplorer, mods[2].IdentityChecker, mods[3].KickbackClocks, mods[4].HTCoverage, mods[5].GarbageDemo];
    for (const C of comps) {
      const html = render(React.createElement(C));
      expect(html.length).toBeGreaterThan(500);
      expect(html).not.toMatch(/katex-error/);
    }
  });

  it('game', async () => {
    for (const g of unit.games) {
      const mod = await g.load();
      const html = render(React.createElement(mod.default));
      expect(html).toMatch(/Hole/);
    }
  });
});
