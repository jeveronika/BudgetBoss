  import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
  import { getAuth, GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged }
    from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
  import { getFirestore, doc, setDoc, getDoc }
    from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

  const firebaseConfig = {
    apiKey: "AIzaSyAo-svGMmJo0hr_Ib4L4lehuidQ1huU0lY",
    authDomain: "budgetbossplanner.firebaseapp.com",
    projectId: "budgetbossplanner",
    storageBucket: "budgetbossplanner.firebasestorage.app",
    messagingSenderId: "88000151234",
    appId: "1:88000151234:web:706a586617fc1858ad055b"
  };

  const app  = initializeApp(firebaseConfig);
  const auth = getAuth(app);
  const db   = getFirestore(app);

  document.getElementById('btnLogin').addEventListener('click', () =>
    signInWithPopup(auth, new GoogleAuthProvider())
      .catch(err => {
        console.error('Login error:', err.code, err.message);
        window.toast('Chyba přihlášení: ' + err.code, 'warn');
      }));
  document.getElementById('btnLogout').addEventListener('click', () => {
    localStorage.removeItem('bb8_user');
    localStorage.removeItem('bb8'); // smaž finanční data z prohlížeče při odhlášení
    signOut(auth).catch(err => console.error('Logout error:', err));
  });

  // Bezpečné volání window funkcí — odolné vůči selhání app.js
  const safeToast = (msg, type) => { try { if (typeof window.toast === 'function') window.toast(msg, type); } catch(_){} };
  const safeRender = () => { try { if (typeof window.render === 'function') window.render(); } catch(_){} };
  const safeEnsureFunds = () => { try { if (typeof window.ensureDefaultFunds === 'function') window.ensureDefaultFunds(); } catch(_){} };

  onAuthStateChanged(auth, async user => {
    const loginScreen   = document.getElementById('loginScreen');
    const loadingScreen = document.getElementById('loadingScreen');
    const appEl         = document.querySelector('.app');

    // Pomocná funkce — vždy skryje loading a zobrazí dashboard
    function showApp(name) {
      loadingScreen.style.display = 'none';
      appEl.style.display         = 'block';
      const initials = name.split(' ').filter(Boolean).map(w=>w[0]).join('').slice(0,2).toUpperCase() || '?';
      document.getElementById('userMenuBtn').style.display = 'flex';
      document.getElementById('userInfo').textContent      = name.split(' ')[0];
      document.getElementById('userInitials').textContent  = initials;
      document.getElementById('udAvatarLg').textContent    = initials;
      document.getElementById('udName').textContent        = name;
    }

    if (user) {
      loginScreen.style.display   = 'none';
      loadingScreen.style.display = 'flex';

      try {
        const snap = await getDoc(doc(db, 'users', user.uid));

        if (snap.exists()) {
          const cs = snap.data().state;
          // Bezpečné přiřazení — window.S nemusí existovat pokud app.js selhal
          if (window.S && typeof window.S === 'object') {
            if (cs.cc)                        window.S.cc         = cs.cc;
            if (cs.data)                      window.S.data       = cs.data;
            if (Array.isArray(cs.goals))      window.S.goals      = cs.goals;
            if (cs.plans)                     window.S.plans      = cs.plans;
            if (cs.catMeta)                   window.S.catMeta    = cs.catMeta;
            if (cs.ruleRatio)                 window.S.ruleRatio  = cs.ruleRatio;
            if (cs.currency)                  window.S.currency   = cs.currency;
            if (Array.isArray(cs.portfolios)) window.S.portfolios = cs.portfolios;
            if (Array.isArray(cs.recurring))  window.S.recurring  = cs.recurring;
            try { localStorage.setItem('bb8', JSON.stringify(window.S)); } catch(_){}
          }
          safeEnsureFunds();
        } else {
          // První přihlášení — čistý stav
          const freshState = {
            cc:{expense:[],income:[],investment:[]},
            data:{},goals:[],plans:{},catMeta:{},
            ruleRatio:{n:50,w:30,s:20},
            currency:'CZK',
            portfolios:[],
            recurring:[]
          };
          window.S = freshState;
          safeEnsureFunds();
          try { localStorage.setItem('bb8', JSON.stringify(window.S)); } catch(_){}
          await setDoc(doc(db, 'users', user.uid), { state: window.S });
          safeToast('Vítej, ' + user.displayName + '! Účet vytvořen ✓', 'success');
        }
      } catch(e) {
        console.error('Firestore chyba:', e);
        safeToast('Chyba načítání dat: ' + (e.code || e.message), 'warn');
      } finally {
        // VŽDY skryj loading — i při pádu app.js nebo Firestore chybě
        localStorage.setItem('bb8_user', JSON.stringify({displayName: user.displayName, uid: user.uid}));
        showApp(user.displayName || '');
        safeRender();
        if (window.S && window.S.data && Object.keys(window.S.data).length)
          safeToast('Vítej zpět, ' + user.displayName + '! ✓', 'success');
        window.saveToCloud = () =>
          setDoc(doc(db, 'users', user.uid), { state: window.S });
      }

    } else {
      const cachedUser  = JSON.parse(localStorage.getItem('bb8_user') || 'null');
      const hasLocalData = !!localStorage.getItem('bb8');

      if (!navigator.onLine && cachedUser && hasLocalData) {
        // OFFLINE REŽIM
        showApp((cachedUser.displayName || '') + ' · offline');
        window.saveToCloud = null;
        safeRender();
        safeToast('Offline režim — data z posledního přihlášení 📴', 'info');
        window.addEventListener('online', () => {
          safeToast('Připojení obnoveno — přihlašuji… 🌐', 'success');
          setTimeout(() => location.reload(), 1200);
        }, { once: true });
      } else {
        // Odhlášení — zobraz login screen
        loadingScreen.style.display = 'none';
        loginScreen.style.display   = 'flex';
        appEl.style.display         = 'none';
        document.getElementById('userMenuBtn').style.display = 'none';
        if (typeof closeUserMenu === 'function') closeUserMenu();
        window.saveToCloud = null;
      }
    }
  });

  window.resetAllData = async function() {
    if (!confirm('⚠️ Smazat veškerá data?\n\nTato akce je nevratná — smažou se všechny transakce, cíle, plány, portfolia i nastavení. Opravdu chceš začít znovu?')) return;
    if (!confirm('Jsi si naprosto jistá? Všechna data budou trvale smazána.')) return;
    try {
      const freshState = {
        cc:{expense:[],income:[],investment:[]},
        data:{},goals:[],plans:{},catMeta:{},
        ruleRatio:{n:50,w:30,s:20},
        currency:'CZK',
        portfolios:[],
        recurring:[]
      };
      window.S = freshState;
      window.ensureDefaultFunds();
      localStorage.setItem('bb8', JSON.stringify(window.S));
      localStorage.removeItem('bb8_user'); // vymaž offline user cache
      if (auth.currentUser) {
        await setDoc(doc(db, 'users', auth.currentUser.uid), { state: window.S });
      }
      window.render();
      window.toast('Všechna data smazána — začínáš znovu ✓', 'success');
    } catch(e) {
      console.error('Reset chyba:', e);
      window.toast('Chyba při resetování: ' + (e.code || e.message), 'warn');
    }
  };
