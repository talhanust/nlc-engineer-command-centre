import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi } from 'vitest';
import { DetailDrawer, ProgressMeter, type DrawerTab } from './DetailDrawer';

const tabs: DrawerTab[] = [
  { id: 'a', label: 'Overview', badge: 3, content: <div>overview body</div> },
  { id: 'b', label: 'Lines', badge: 12, content: <div>lines body</div> },
  { id: 'c', label: 'History', content: <div>history body</div> },
];

describe('DetailDrawer', () => {
  it('shows the first tab by default and switches on click', async () => {
    const user = userEvent.setup();
    render(<DetailDrawer title="NLC/X/SC-01" pill={<span>Awarded</span>} tabs={tabs} onClose={() => {}} />);
    expect(screen.getByText('overview body')).toBeInTheDocument();
    expect(screen.queryByText('lines body')).toBeNull();

    await user.click(screen.getByRole('tab', { name: /Lines/ }));
    expect(screen.getByText('lines body')).toBeInTheDocument();
    expect(screen.queryByText('overview body')).toBeNull();
  });

  it('shows a badge count on a tab', () => {
    render(<DetailDrawer title="T" tabs={tabs} onClose={() => {}} />);
    const linesTab = screen.getByRole('tab', { name: /Lines/ });
    expect(within(linesTab).getByText('12')).toBeInTheDocument();
  });

  it('honours initialTab', () => {
    render(<DetailDrawer title="T" tabs={tabs} initialTab="c" onClose={() => {}} />);
    expect(screen.getByText('history body')).toBeInTheDocument();
  });

  it('closes on Escape and on the ✕ button', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<DetailDrawer title="T" tabs={tabs} onClose={onClose} />);
    await user.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalledTimes(1);
    await user.click(screen.getByRole('button', { name: 'Close details' }));
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it('still supports the simple children form (person/project drawers)', () => {
    render(<DetailDrawer title="Someone" subtitle="Engineer" onClose={() => {}}><p>plain body</p></DetailDrawer>);
    expect(screen.getByText('plain body')).toBeInTheDocument();
  });

  it('renders a hero band when given one', () => {
    render(<DetailDrawer title="T" hero={<div>hero stats</div>} tabs={tabs} onClose={() => {}} />);
    expect(screen.getByText('hero stats')).toBeInTheDocument();
  });
});

describe('ProgressMeter', () => {
  it('reports its value as a progressbar and clamps out-of-range input', () => {
    render(<ProgressMeter pct={140} />);
    const bar = screen.getByRole('progressbar');
    expect(bar).toHaveAttribute('aria-valuenow', '100'); // clamped
  });

  it('floors a negative or non-finite value at 0', () => {
    render(<ProgressMeter pct={Number.NaN} />);
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '0');
  });
});

describe('DetailDrawer — sizing', () => {
  it('a record opens full-window and can collapse to a side panel', async () => {
    const user = userEvent.setup();
    render(<DetailDrawer title="NLC/X/SC-01" width="full" tabs={tabs} onClose={() => {}} />);
    const panel = screen.getByRole('dialog');
    expect(panel).toHaveClass('drawer-full');

    // Collapse to a side panel…
    await user.click(screen.getByRole('button', { name: 'Collapse to side panel' }));
    expect(screen.getByRole('dialog')).toHaveClass('drawer-wide');

    // …and expand back to full.
    await user.click(screen.getByRole('button', { name: 'Expand to full window' }));
    expect(screen.getByRole('dialog')).toHaveClass('drawer-full');
  });

  it('a full-window drawer removes the dark scrim (no black strip)', () => {
    render(<DetailDrawer title="T" width="full" tabs={tabs} onClose={() => {}} />);
    // The backdrop of a full drawer is opaque surface, not a translucent band.
    expect(screen.getByRole('dialog').parentElement).toHaveClass('drawer-backdrop-full');
  });

  it('a narrow (person) drawer is a fixed peek with no resize control', () => {
    render(<DetailDrawer title="Someone" width="narrow" onClose={() => {}}><p>x</p></DetailDrawer>);
    expect(screen.getByRole('dialog')).toHaveClass('drawer-narrow');
    expect(screen.queryByRole('button', { name: /Expand|Collapse/ })).toBeNull();
  });
})

describe('DetailDrawer — escapes the content area', () => {
  it('renders at document.body via a portal, not nested in the caller', () => {
    const { container } = render(
      <div style={{ zoom: 1.1 as unknown as number }} data-testid="zoomed-parent">
        <DetailDrawer title="NLC/X/SC-01" width="full" tabs={tabs} onClose={() => {}} />
      </div>,
    );
    // The dialog is NOT inside the caller's (zoomed) subtree…
    expect(within(container).queryByRole('dialog')).toBeNull();
    // …it's portalled to the body, so position:fixed covers the real viewport.
    const dialog = screen.getByRole('dialog');
    expect(dialog).toBeInTheDocument();
    expect(container.querySelector('[data-testid="zoomed-parent"]')!.contains(dialog)).toBe(false);
  });

  it('a full drawer still shows its header controls (close + resize)', () => {
    render(<DetailDrawer title="NLC/X/SC-01" width="full" tabs={tabs} onClose={() => {}} />);
    expect(screen.getByRole('button', { name: 'Close details' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Collapse to side panel' })).toBeInTheDocument();
  });
});
