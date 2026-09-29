// ==UserScript==
// @name         MTGNexus Deck Sync Assistant
// @namespace    https://frostpointlabs.com/
// @version      1.0
// @description  Automatically update [deck] tags in your MTGNexus primer and thread posts from the MTG Deck Builder.
// @author       Antigravity & Andy
// @match        https://www.mtgnexus.com/viewtopic.php*
// @match        https://www.mtgnexus.com/posting.php*
// @grant        GM_setClipboard
// @grant        GM_addStyle
// ==/UserScript==

(function () {
  'use strict';

  const DECK_REGEX = /\[deck(?:=[^\]]*)?\][\s\S]*?\[\/deck\]/i;

  // Visual notification toast
  function showToast(message, isError = false) {
    const existing = document.getElementById('nexus-sync-toast');
    if (existing) existing.remove();

    const toast = document.createElement('div');
    toast.id = 'nexus-sync-toast';
    toast.textContent = message;
    Object.assign(toast.style, {
      position: 'fixed',
      bottom: '24px',
      right: '24px',
      backgroundColor: isError ? '#881337' : '#064e3b',
      color: '#fff',
      padding: '12px 20px',
      borderRadius: '10px',
      boxShadow: '0 10px 25px rgba(0,0,0,0.5)',
      fontSize: '13px',
      fontWeight: '600',
      zIndex: '999999',
      transition: 'opacity 0.3s ease',
      border: isError ? '1px solid #f43f5e' : '1px solid #10b981',
      display: 'flex',
      alignItems: 'center',
      gap: '8px',
      fontFamily: 'system-ui, -apple-system, sans-serif'
    });

    document.body.appendChild(toast);
    setTimeout(() => {
      toast.style.opacity = '0';
      setTimeout(() => toast.remove(), 350);
    }, 4500);
  }

  // 1. Thread View Page (viewtopic.php)
  if (window.location.pathname.includes('viewtopic.php')) {
    // Find all posts on the page
    const posts = document.querySelectorAll('.post');
    if (!posts || posts.length === 0) return;

    // Check the first post (primer / main post)
    const firstPost = posts[0];
    const editBtn = firstPost.querySelector('a[href*="mode=edit"]');
    if (!editBtn) return; // User doesn't own or cannot edit this post

    // Add a "⚡ Sync Deck" action button into the post controls
    const buttonGroup = firstPost.querySelector('.post-buttons') || firstPost.querySelector('ul.profile-icons') || editBtn.parentElement;
    if (!buttonGroup) return;

    const syncBtn = document.createElement('a');
    syncBtn.href = 'javascript:void(0);';
    syncBtn.className = 'button button-icon-only';
    syncBtn.title = 'Sync Deck from Deck Builder (Clipboard)';
    syncBtn.innerHTML = '<span style="color:#10b981; font-weight:bold; margin-right:4px;">⚡</span><span style="font-weight:bold; color:#e2e8f0;">Sync Deck</span>';
    syncBtn.style.marginLeft = '6px';
    syncBtn.style.padding = '4px 8px';
    syncBtn.style.borderRadius = '6px';
    syncBtn.style.backgroundColor = '#1e293b';
    syncBtn.style.border = '1px solid #334155';
    syncBtn.style.textDecoration = 'none';
    syncBtn.style.display = 'inline-flex';
    syncBtn.style.alignItems = 'center';

    syncBtn.addEventListener('click', async (e) => {
      e.preventDefault();
      try {
        const clipText = await navigator.clipboard.readText();
        if (!clipText || !DECK_REGEX.test(clipText)) {
          showToast('Clipboard does not contain a valid [deck]...[/deck] block. Copy from Deck Builder first!', true);
          return;
        }

        // Store deck in sessionStorage and redirect to edit page
        sessionStorage.setItem('mtgnexus_pending_deck_sync', clipText);
        showToast('Deck found! Opening edit page to replace [deck] tags...');
        const editUrl = new URL(editBtn.href, window.location.origin);
        editUrl.searchParams.set('autoupdate', 'deck');
        window.location.href = editUrl.toString();
      } catch (err) {
        showToast('Please grant clipboard permissions to read the decklist.', true);
      }
    });

    buttonGroup.appendChild(syncBtn);
  }

  // 2. Post Edit Page (posting.php)
  if (window.location.pathname.includes('posting.php')) {
    const textarea = document.getElementById('message') || document.querySelector('textarea[name="message"]');
    if (!textarea) return;

    // Helper to replace deck tag
    const performReplacement = (newDeckBBCode) => {
      const currentText = textarea.value;
      if (!DECK_REGEX.test(currentText)) {
        const shouldPrepend = confirm('No existing [deck]...[/deck] tag was found in this post.\n\nWould you like to insert the decklist at the very top of your post?');
        if (shouldPrepend) {
          textarea.value = newDeckBBCode + '\n\n' + currentText;
          showToast('Decklist prepended to the top of your post! Click Submit to save.');
        }
        return;
      }

      // Replace first [deck] block
      textarea.value = currentText.replace(DECK_REGEX, newDeckBBCode.trim());
      showToast('✓ [deck] tag successfully replaced! Review and click Submit.');

      // Highlight textarea briefly
      const origBorder = textarea.style.borderColor;
      textarea.style.transition = 'border-color 0.4s ease, box-shadow 0.4s ease';
      textarea.style.borderColor = '#10b981';
      textarea.style.boxShadow = '0 0 15px rgba(16, 185, 129, 0.4)';
      setTimeout(() => {
        textarea.style.borderColor = origBorder;
        textarea.style.boxShadow = 'none';
      }, 2500);

      textarea.focus();
    };

    // Auto-update if triggered from viewtopic redirect
    const urlParams = new URLSearchParams(window.location.search);
    const pendingDeck = sessionStorage.getItem('mtgnexus_pending_deck_sync');
    if (urlParams.get('autoupdate') === 'deck' && pendingDeck) {
      sessionStorage.removeItem('mtgnexus_pending_deck_sync');
      setTimeout(() => {
        performReplacement(pendingDeck);
      }, 300);
    }

    // Add a persistent Sync bar right above the editor textarea
    const container = document.createElement('div');
    container.style.display = 'flex';
    container.style.alignItems = 'center';
    container.style.justifyContent = 'space-between';
    container.style.backgroundColor = '#0f172a';
    container.style.border = '1px solid #1e293b';
    container.style.borderRadius = '8px';
    container.style.padding = '8px 14px';
    container.style.marginBottom = '10px';
    container.style.fontFamily = 'system-ui, -apple-system, sans-serif';

    container.innerHTML = `
      <div style="display:flex; align-items:center; gap:8px;">
        <span style="font-size:15px;">⚡</span>
        <span style="font-size:12px; font-weight:700; color:#38bdf8;">MTGNexus Deck Sync Assistant</span>
        <span style="font-size:11px; color:#94a3b8;">— Replace [deck] tags with 1 click</span>
      </div>
      <div style="display:flex; gap:8px;">
        <button type="button" id="btn-nexus-sync-clip" style="background:#10b981; color:#022c22; font-weight:700; border:none; border-radius:6px; padding:5px 12px; font-size:11px; cursor:pointer;">
          Paste from Clipboard
        </button>
      </div>
    `;

    textarea.parentElement.insertBefore(container, textarea);

    const clipBtn = document.getElementById('btn-nexus-sync-clip');
    if (clipBtn) {
      clipBtn.addEventListener('click', async () => {
        try {
          const clip = await navigator.clipboard.readText();
          if (!clip || !DECK_REGEX.test(clip)) {
            showToast('Clipboard does not contain a valid [deck] block. Copy from Deck Builder first.', true);
            return;
          }
          performReplacement(clip);
        } catch (e) {
          const manual = prompt('Paste your [deck]...[/deck] BBCode here:');
          if (manual && DECK_REGEX.test(manual)) {
            performReplacement(manual);
          } else if (manual) {
            showToast('Invalid deck BBCode format.', true);
          }
        }
      });
    }
  }
})();
