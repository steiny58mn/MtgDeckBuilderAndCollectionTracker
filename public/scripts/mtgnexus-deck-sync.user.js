// ==UserScript==
// @name         MTGNexus Deck Sync Assistant
// @namespace    https://frostpointlabs.com/
// @version      1.4
// @description  Automatically update [deck] tags in your MTGNexus primer and thread posts from the MTG Deck Builder.
// @author       Andy & Antigravity
// @match        https://www.mtgnexus.com/*
// @match        https://mtgnexus.com/*
// @match        http://www.mtgnexus.com/*
// @match        http://mtgnexus.com/*
// @include      *://*.mtgnexus.com/*
// @include      *://mtgnexus.com/*
// @include      *mtgnexus.com*
// @run-at       document-idle
// @grant        none
// ==/UserScript==

(function () {
  'use strict';

  console.log('%c[MTGNexus Deck Sync] ⚡ Script initialized on: ' + window.location.href, 'color: #38bdf8; font-weight: bold; font-size: 13px;');

  const DECK_REGEX = /\[deck(?:=[^\]]*)?\][\s\S]*?\[\/deck\]/i;
  let hasAutoRedirected = false;

  function showToast(message, isError = false) {
    const existing = document.getElementById('nexus-sync-toast');
    if (existing) existing.remove();

    const toast = document.createElement('div');
    toast.id = 'nexus-sync-toast';
    toast.innerHTML = `<span style="font-size:16px;">${isError ? '⚠️' : '✅'}</span> <span>${message}</span>`;
    Object.assign(toast.style, {
      position: 'fixed',
      bottom: '80px',
      right: '24px',
      backgroundColor: isError ? '#881337' : '#064e3b',
      color: '#fff',
      padding: '12px 20px',
      borderRadius: '10px',
      boxShadow: '0 12px 30px rgba(0,0,0,0.7)',
      fontSize: '13px',
      fontWeight: '600',
      zIndex: '2147483647',
      transition: 'opacity 0.3s ease',
      border: isError ? '1px solid #f43f5e' : '1px solid #10b981',
      display: 'flex',
      alignItems: 'center',
      gap: '8px',
      fontFamily: 'system-ui, -apple-system, sans-serif'
    });

    (document.body || document.documentElement).appendChild(toast);
    setTimeout(() => {
      toast.style.opacity = '0';
      setTimeout(() => toast.remove(), 400);
    }, 4500);
  }

  function replaceDeckInTextarea(textarea, newDeckBBCode) {
    if (!textarea) return false;
    const currentText = textarea.value || '';

    if (!DECK_REGEX.test(currentText)) {
      const shouldPrepend = confirm(
        'No existing [deck]...[/deck] tag was found in this post.\n\nWould you like to insert the decklist at the top of your post?'
      );
      if (shouldPrepend) {
        textarea.value = newDeckBBCode.trim() + '\n\n' + currentText;
        showToast('Decklist prepended to the top of your post! Click Submit to save.');
        triggerChange(textarea);
        return true;
      }
      return false;
    }

    textarea.value = currentText.replace(DECK_REGEX, newDeckBBCode.trim());
    showToast('✓ [deck] tag successfully replaced! Review and click Submit.');
    triggerChange(textarea);

    const origBorder = textarea.style.borderColor;
    textarea.style.transition = 'border-color 0.4s ease, box-shadow 0.4s ease';
    textarea.style.borderColor = '#10b981';
    textarea.style.boxShadow = '0 0 18px rgba(16, 185, 129, 0.6)';
    setTimeout(() => {
      textarea.style.borderColor = origBorder;
      textarea.style.boxShadow = 'none';
    }, 3000);

    textarea.focus();
    return true;
  }

  function triggerChange(el) {
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  }

  // --- THREAD AUTO REDIRECT ---
  function checkAutoRedirectOnThread() {
    if (hasAutoRedirected) return;
    const urlParams = new URLSearchParams(window.location.search);
    const hasAutoUpdate = urlParams.get('autoupdate') === 'deck' || window.location.hash.includes('autoupdate=deck');
    if (!hasAutoUpdate) return;

    // Only redirect if viewing a topic and NOT on the edit form
    if (window.location.pathname.includes('posting.php')) return;

    const editLinks = Array.from(document.querySelectorAll('a[href*="mode=edit"]'));
    if (editLinks.length > 0) {
      hasAutoRedirected = true;
      console.log('[MTGNexus Deck Sync] Auto-redirecting to edit page...', editLinks[0].href);
      showToast('Found deck post! Opening edit page...');
      const editUrl = new URL(editLinks[0].href, window.location.origin);
      editUrl.searchParams.set('autoupdate', 'deck');
      window.location.href = editUrl.toString();
    }
  }

  // --- EDIT MODE CHECK ---
  function isThreadEditMode() {
    const isPostingPhp = window.location.pathname.includes('posting.php');
    const urlParams = new URLSearchParams(window.location.search);
    const mode = urlParams.get('mode');
    const hasEditParam = mode === 'edit' || window.location.href.includes('mode=edit');
    const hasTextarea = !!(document.getElementById('message') || document.querySelector('textarea[name="message"]'));

    return hasEditParam || (isPostingPhp && hasTextarea && mode !== 'reply' && mode !== 'post' && mode !== 'quote');
  }

  // --- SYNC DECK BUTTON (DISPLAY ONLY IN EDIT MODE) ---
  function injectSyncDeckButtonInEditMode() {
    const inEditMode = isThreadEditMode();
    const existingBtn = document.getElementById('nexus-floating-sync-btn');

    // If NOT in EditMode of a thread, ensure button is not displayed
    if (!inEditMode) {
      if (existingBtn) existingBtn.remove();
      return;
    }

    // If already injected in EditMode, keep it
    if (existingBtn) return;

    const target = document.body || document.documentElement;
    if (!target) return;

    const floatContainer = document.createElement('div');
    floatContainer.id = 'nexus-floating-sync-btn';
    Object.assign(floatContainer.style, {
      position: 'fixed',
      bottom: '20px',
      right: '20px',
      zIndex: '2147483647',
      display: 'flex',
      alignItems: 'center',
      gap: '8px',
      fontFamily: 'system-ui, -apple-system, sans-serif'
    });

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.innerHTML = '<span style="font-size:16px; margin-right:6px;">⚡</span><span style="font-weight:800; font-size:13px; letter-spacing:0.5px;">SYNC DECK</span>';
    Object.assign(btn.style, {
      backgroundColor: '#0284c7',
      color: '#ffffff',
      border: '2px solid #38bdf8',
      borderRadius: '30px',
      padding: '10px 20px',
      cursor: 'pointer',
      boxShadow: '0 8px 25px rgba(2, 132, 199, 0.6)',
      display: 'flex',
      alignItems: 'center',
      transition: 'transform 0.15s ease, background-color 0.2s ease'
    });

    btn.onmouseenter = () => {
      btn.style.backgroundColor = '#0369a1';
      btn.style.transform = 'scale(1.05)';
    };
    btn.onmouseleave = () => {
      btn.style.backgroundColor = '#0284c7';
      btn.style.transform = 'scale(1)';
    };

    btn.addEventListener('click', async () => {
      const textarea = document.getElementById('message') || document.querySelector('textarea[name="message"]') || document.querySelector('textarea');

      let clipText = '';
      try {
        clipText = await navigator.clipboard.readText();
      } catch (err) {
        clipText = prompt('Paste your [deck]...[/deck] BBCode here:');
      }

      if (!clipText || !DECK_REGEX.test(clipText)) {
        showToast('Clipboard does not contain a valid [deck] block. Copy from Deck Builder first!', true);
        return;
      }

      if (textarea) {
        replaceDeckInTextarea(textarea, clipText);
      } else {
        showToast('No message text area found to update.', true);
      }
    });

    floatContainer.appendChild(btn);
    target.appendChild(floatContainer);
  }

  // --- POST EDITING SCREEN (AUTOMATED SYNC) ---
  function hookPostEditor() {
    // Clean up any legacy or stale editor sync bar if present
    const existingBar = document.getElementById('nexus-editor-sync-bar');
    if (existingBar) existingBar.remove();

    const textarea = document.getElementById('message') || document.querySelector('textarea[name="message"]') || document.querySelector('textarea');
    if (!textarea) return;

    const urlParams = new URLSearchParams(window.location.search);
    const pendingDeck = sessionStorage.getItem('mtgnexus_pending_deck_sync');
    if (urlParams.get('autoupdate') === 'deck') {
      if (pendingDeck) {
        sessionStorage.removeItem('mtgnexus_pending_deck_sync');
        setTimeout(() => {
          replaceDeckInTextarea(textarea, pendingDeck);
        }, 400);
      } else if (navigator.clipboard && navigator.clipboard.readText) {
        navigator.clipboard.readText().then((clip) => {
          if (clip && DECK_REGEX.test(clip)) {
            setTimeout(() => {
              replaceDeckInTextarea(textarea, clip);
            }, 400);
          }
        }).catch(() => {
          // User action required for clipboard permissions in some browsers
        });
      }
    }
  }

  function setup() {
    checkAutoRedirectOnThread();
    injectSyncDeckButtonInEditMode();
    hookPostEditor();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', setup);
  } else {
    setup();
  }

  // Periodic poll to ensure presence even on dynamic SPAs or late DOM renders
  setInterval(setup, 1000);
})();
