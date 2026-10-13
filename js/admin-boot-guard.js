    /* Safety fallback: admin.js must never leave this protected entry blank.
       It no longer sends anyone to another page on its own — the panel locks in
       place and offers the two ways onward as buttons (js/panel-lockdown.js
       shows the same card when the module itself is what failed). */
    window.setTimeout(() => {
      const shell = document.getElementById('adminShell');
      if (!shell || !shell.hidden || document.getElementById('apcPanelLock')) return;
      const card = document.createElement('section');
      card.id = 'apcPanelLockBoot';
      card.className = 'apc-lock-card';
      card.setAttribute('role', 'alert');
      const eyebrow = document.createElement('p');
      eyebrow.className = 'apc-lock-eyebrow';
      eyebrow.textContent = 'এক প্যানেল থেকে অন্য প্যানেলে নয়';
      const title = document.createElement('h1');
      title.textContent = 'এডমিন প্যানেল খোলা হয়নি';
      const copy = document.createElement('p');
      copy.textContent = 'প্যানেল চালু করা যায়নি। আবার চেষ্টা করুন, অথবা লগইন পেজ থেকে নিজের ইউজারনেম ও পাসওয়ার্ড দিয়ে প্রবেশ করুন।';
      const actions = document.createElement('div');
      actions.className = 'apc-lock-actions';
      const retry = document.createElement('button');
      retry.type = 'button';
      retry.id = 'apcPanelBootRetry';
      retry.textContent = 'আবার চেষ্টা করুন';
      retry.addEventListener('click', () => window.location.reload());
      const login = document.createElement('button');
      login.type = 'button';
      login.id = 'apcPanelBootLogin';
      login.className = 'apc-lock-primary';
      login.textContent = 'লগইন পেজে যান';
      login.addEventListener('click', () => window.location.assign('./index.html'));
      actions.append(retry, login);
      card.append(eyebrow, title, copy, actions);
      document.body.append(card);
    }, 4000);
