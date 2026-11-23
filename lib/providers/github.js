function parseItem(rawUrl) {
  try {
    const url = new URL(rawUrl);
    if (url.origin !== 'https://github.com' || url.username || url.password) {
      return null;
    }
    const parts = url.pathname.match(/^\/([\w.-]+)\/([\w.-]+)\/(issues|pull)\/([1-9]\d*)(?:\/|$)/);
    if (!parts) {
      return null;
    }
    const [, owner, repo, type, number] = parts;
    return { owner, repo, type, number };
  } catch {
    return null;
  }
}

function match(rawUrl) {
  const item = parseItem(rawUrl);
  if (!item) {
    return null;
  }
  return {
    url: `https://github.com/${item.owner}/${item.repo}/${item.type}/${item.number}`,
    kind: item.type === 'pull' ? 'PR' : 'Issue',
  };
}

function duplicateKey(rawUrl) {
  const item = parseItem(rawUrl);
  if (!item) {
    return null;
  }
  // GitHub shares a single per-repository numbering sequence for issues and PRs,
  // and owner/repo names are case-insensitive.
  return `github:${item.owner.toLowerCase()}/${item.repo.toLowerCase()}#${item.number}`;
}

function parse(root) {
  // Only header chips are authoritative. Timeline events, comments and linked
  // issues can contain other states, including a PR's earlier "Closed" event.
  // GitHub's issue metadata (including header-state) can be a sibling of the
  // issue-header title region, rather than a descendant of it.
  const chips = root.querySelectorAll(
    '[data-testid="header-state"], ' +
      '[data-component="PageHeader"] [data-component="StateLabel"], ' +
      '.gh-header .State, #partial-discussion-header .State',
  );
  const states = new Set();
  const statuses = {
    issueOpened: 'open',
    issueClosed: 'closed',
    issueClosedNotPlanned: 'not-planned',
    pullOpened: 'open',
    pullClosed: 'closed',
    pullMerged: 'merged',
    pullDraft: 'draft',
  };
  for (const chip of chips) {
    let state = statuses[chip.getAttribute('data-status')];
    if (!state) {
      const text = chip.textContent.trim().replace(/\s+/g, ' ').toLowerCase();
      if (/^(open|closed|merged|draft)$/.test(text)) {
        state = text;
      } else if (/^(closed \()?not planned\)?$/.test(text)) {
        state = 'not-planned';
      }
    }
    if (state) {
      states.add(state);
    }
  }
  // Conflicting or missing headers should never suggest that a tab is safe to close.
  return states.size === 1 ? [...states][0] : null;
}

export const github = {
  id: 'github',
  label: 'GitHub',
  itemLabel: 'issues & pull requests',
  finishedLabel: 'Closed / merged',
  accessDescription:
    'Use your existing sign-in to read page statuses. No token needed. Enable access to github.com to get started.',
  origins: ['https://github.com/*'],
  match,
  duplicateKey,
  parse,
  states: {
    open: { label: 'Open', tone: 'green' },
    draft: { label: 'Draft', tone: 'grey' },
    merged: { label: 'Merged', tone: 'purple', finished: true },
    closed: { label: 'Closed', tone: 'red', finished: true },
    'not-planned': { label: 'Not planned', tone: 'grey', finished: true },
  },
};
