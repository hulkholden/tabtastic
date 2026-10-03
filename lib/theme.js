// Apply the saved theme before the stylesheet loads to avoid a light flash.
(() => {
  const key = 'theme';
  const system = window.matchMedia('(prefers-color-scheme: dark)');
  const normalize = (value) => (['light', 'dark'].includes(value) ? value : 'system');
  let preference = 'system';
  try {
    preference = normalize(localStorage.getItem(key));
  } catch {
    // System mode still works if browser storage is unavailable.
  }

  function apply() {
    let theme = preference;
    if (theme === 'system') {
      theme = system.matches ? 'dark' : 'light';
    }
    document.documentElement.dataset.theme = theme;
    document.querySelectorAll('#theme [data-theme]').forEach((button) => {
      button.setAttribute('aria-pressed', String(button.dataset.theme === preference));
    });
  }

  apply();
  system.addEventListener('change', apply);
  window.addEventListener('storage', (event) => {
    if (event.storageArea === localStorage && (event.key === key || event.key === null)) {
      preference = normalize(event.newValue);
      apply();
    }
  });
  document.addEventListener('DOMContentLoaded', () => {
    apply();
    document.querySelectorAll('#theme [data-theme]').forEach((button) => {
      button.addEventListener('click', () => {
        preference = normalize(button.dataset.theme);
        apply();
        try {
          localStorage.setItem(key, preference);
        } catch {
          // Keep the current page usable even when the preference cannot be saved.
        }
      });
    });
  });
})();
