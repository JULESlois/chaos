import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { routes } from './router';
import { projects } from '@/content/projects';

/**
 * Routing tests run the *real* provider stack and shell, which means they also
 * cover the no-WebGL degradation path: jsdom reports render level 3, so the TV
 * chapter must fall back to its DOM presentation instead of mounting a Canvas.
 */
function renderRoute(path: string): void {
  const router = createMemoryRouter(routes, { initialEntries: [path] });
  render(<RouterProvider router={router} />);
}

describe('application routing', () => {
  it('renders the index at /', async () => {
    renderRoute('/');
    expect(await screen.findByRole('heading', { name: 'Archive Terminal' })).toBeTruthy();
  });

  it('renders the archive index at /archive', async () => {
    renderRoute('/archive');
    expect(await screen.findByRole('heading', { level: 1, name: 'Archive' })).toBeTruthy();
  });

  it('resolves every published record slug', async () => {
    for (const record of projects) {
      const router = createMemoryRouter(routes, {
        initialEntries: [`/archive/${record.slug}`],
      });
      const view = render(<RouterProvider router={router} />);
      expect(
        await screen.findByRole('heading', { level: 1, name: record.title }),
      ).toBeTruthy();
      view.unmount();
    }
  });

  it('renders the record body for a known slug', async () => {
    renderRoute('/archive/visual-signal-engine');

    expect(
      await screen.findByRole('heading', { level: 1, name: 'VISUAL SIGNAL ENGINE' }),
    ).toBeTruthy();
    expect(screen.getByText('REC-001')).toBeTruthy();
    expect(screen.getByRole('heading', { level: 2, name: 'summary' })).toBeTruthy();
    expect(screen.getByRole('heading', { level: 2, name: 'anomaly log' })).toBeTruthy();
    expect(document.title).toContain('VISUAL SIGNAL ENGINE');
  });

  it('falls back to the 404 record for an unknown slug', async () => {
    renderRoute('/archive/no-such-record');

    expect(await screen.findByRole('heading', { name: 'ERROR 404' })).toBeTruthy();
    expect(screen.queryByRole('heading', { level: 2, name: 'summary' })).toBeNull();
    // The record page owns the title for a failed lookup, not the 404 body.
    expect(document.title).toBe('RECORD NOT FOUND // NODE 07');
  });

  it('renders 404 for an unmatched path', async () => {
    renderRoute('/operator/does-not-exist');
    expect(await screen.findByRole('heading', { name: 'ERROR 404' })).toBeTruthy();
  });

  it('lazily resolves the unlisted /signal route', async () => {
    renderRoute('/signal');
    expect(await screen.findByRole('heading', { level: 1, name: 'Signal' })).toBeTruthy();
  });

  it('reaches /signal from the hidden 404 entry after two activations', async () => {
    const user = userEvent.setup();
    renderRoute('/archive/no-such-record');

    const hidden = await screen.findByRole('button', {
      name: 'Inspect the incomplete lookup trace',
    });
    await user.click(hidden);

    const revealed = await screen.findByRole('button', {
      name: 'Open the unlisted signal record',
    });
    await user.click(revealed);

    await waitFor(() => {
      expect(screen.getByRole('heading', { level: 1, name: 'Signal' })).toBeTruthy();
    });
  });

  it('degrades the receiver to the DOM presentation without WebGL', async () => {
    renderRoute('/');

    const section = await screen.findByRole('region', { name: 'receiver' });
    expect(section.getAttribute('data-mode')).toBe('dom');
    expect(section.querySelector('.dom-tv')).not.toBeNull();

    // The accessible control bar must exist in every presentation mode.
    expect(screen.getByRole('button', { name: /next channel/i })).toBeTruthy();
  });
});
