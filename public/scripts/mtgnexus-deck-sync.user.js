// ==UserScript==
// @name         MTGNexus Deck Sync Assistant
// @namespace    https://frostpointlabs.com/
// @version      1.3
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

  // --- FLOATING ACTION BUTTON ---
  function injectFloatingSyncButton() {
    if (document.getElementById('nexus-floating-sync-btn')) return;
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
        return;
      }

      const editLinks = Array.from(document.querySelectorAll('a[href*="mode=edit"]'));
      if (editLinks.length > 0) {
        sessionStorage.setItem('mtgnexus_pending_deck_sync', clipText);
        showToast('Deck verified! Opening edit post page...');
        const editUrl = new URL(editLinks[0].href, window.location.origin);
        editUrl.searchParams.set('autoupdate', 'deck');
        window.location.href = editUrl.toString();
        return;
      }

      showToast('No editable post found on this page. Make sure you are logged in!', true);
    });

    floatContainer.appendChild(btn);
    target.appendChild(floatContainer);
  }

  // --- IN-THREAD EDIT BUTTONS ---
  function hookInThreadEditButtons() {
    const editLinks = document.querySelectorAll('a[href*="mode=edit"]');
    editLinks.forEach((editLink) => {
      if (editLink.dataset.nexusSyncHooked) return;
      editLink.dataset.nexusSyncHooked = 'true';

      const parent = editLink.parentElement;
      if (!parent) return;

      const inlineBtn = document.createElement('a');
      inlineBtn.href = 'javascript:void(0);';
      inlineBtn.className = 'button button-icon-only';
      inlineBtn.title = 'Sync Deck from Deck Builder';
      inlineBtn.innerHTML = '<span style="color:#10b981; font-weight:bold; margin-right:3px;">⚡</span><span style="font-weight:bold; font-size:11px;">Sync</span>';
      inlineBtn.style.marginLeft = '4px';
      inlineBtn.style.padding = '3px 8px';
      inlineBtn.style.borderRadius = '5px';
      inlineBtn.style.backgroundColor = '#1e293b';
      inlineBtn.style.border = '1px solid #334155';
      inlineBtn.style.color = '#e2e8f0';
      inlineBtn.style.textDecoration = 'none';
      inlineBtn.style.display = 'inline-flex';
      inlineBtn.style.alignItems = 'center';
      inlineBtn.style.verticalAlign = 'middle';

      inlineBtn.addEventListener('click', async (e) => {
        e.preventDefault();
        try {
          const clipText = await navigator.clipboard.readText();
          if (!clipText || !DECK_REGEX.test(clipText)) {
            showToast('Clipboard does not contain a valid [deck] block. Copy from Deck Builder first!', true);
            return;
          }
          sessionStorage.setItem('mtgnexus_pending_deck_sync', clipText);
          showToast('Deck verified! Opening edit screen...');
          const editUrl = new URL(editLink.href, window.location.origin);
          editUrl.searchParams.set('autoupdate', 'deck');
          window.location.href = editUrl.toString();
        } catch (err) {
          showToast('Please grant clipboard permissions or paste manually on the edit screen.', true);
        }
      });

      parent.insertBefore(inlineBtn, editLink.nextSibling);
    });
  }

  // --- POST EDITING SCREEN ---
  function hookPostEditor() {
    const textarea = document.getElementById('message') || document.querySelector('textarea[name="message"]') || document.querySelector('textarea');
    if (!textarea || document.getElementById('nexus-editor-sync-bar')) return;

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

    const bar = document.createElement('div');
    bar.id = 'nexus-editor-sync-bar';
    Object.assign(bar.style, {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      backgroundColor: '#0f172a',
      border: '1px solid #1e293b',
      borderRadius: '8px',
      padding: '8px 14px',
      marginBottom: '10px',
      fontFamily: 'system-ui, -apple-system, sans-serif'
    });

    bar.innerHTML = `
      <div style="display:flex; align-items:center; gap:8px;">
        <span style="font-size:16px;">⚡</span>
        <span style="font-size:12px; font-weight:700; color:#38bdf8;">MTGNexus Deck Sync Assistant</span>
        <span style="font-size:11px; color:#94a3b8;">— Replace [deck] tag from Clipboard</span>
      </div>
      <div style="display:flex; align-items:center; gap:8px;">
        <button type="button" id="btn-nexus-copy-edit-url" title="Copy this direct edit URL to paste into MTG Deck Builder" style="background:#1e293b; color:#94a3b8; font-weight:600; border:1px solid #334155; border-radius:6px; padding:6px 12px; font-size:11px; cursor:pointer;">
          Copy Edit URL
        </button>
        <button type="button" id="btn-nexus-sync-clip" style="background:#10b981; color:#022c22; font-weight:700; border:none; border-radius:6px; padding:6px 14px; font-size:11px; cursor:pointer;">
          Paste &amp; Replace [deck]
        </button>
      </div>
    `;

    textarea.parentElement.insertBefore(bar, textarea);

    const copyUrlBtn = document.getElementById('btn-nexus-copy-edit-url');
    if (copyUrlBtn) {
      copyUrlBtn.addEventListener('click', async () => {
        const cleanUrl = new URL(window.location.href);
        cleanUrl.searchParams.delete('autoupdate');
        try {
          await navigator.clipboard.writeText(cleanUrl.toString());
          showToast('Direct Edit URL copied! Paste it into MTG Deck Builder.');
        } catch {
          prompt('Direct Edit URL:', cleanUrl.toString());
        }
      });
    }

    const clipBtn = document.getElementById('btn-nexus-sync-clip');
    if (clipBtn) {
      clipBtn.addEventListener('click', async () => {
        let clip = '';
        try {
          clip = await navigator.clipboard.readText();
        } catch (e) {
          clip = prompt('Paste your [deck]...[/deck] BBCode here:');
        }

        if (!clip || !DECK_REGEX.test(clip)) {
          showToast('Clipboard does not contain a valid [deck] block. Copy from Deck Builder first.', true);
          return;
        }

        replaceDeckInTextarea(textarea, clip);
      });
    }
  }

  function setup() {
    checkAutoRedirectOnThread();
    injectFloatingSyncButton();
    hookInThreadEditButtons();
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
