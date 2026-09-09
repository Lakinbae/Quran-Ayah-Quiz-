
(() => {

  'use strict';


  /* =========================================================
     CONFIG
  ========================================================= */

  const API_BASE =
    (
      window.AYAH_QUIZ_API ||
      'https://ayah-quiz-backend.onrender.com'
    ).replace(/\/$/, '');

  const ALQURAN =
    'https://api.alquran.cloud/v1';

  const LEGACY_KEY =
    'ayahquiz_profile_v12';

  const STORAGE_PREFIX =
    'ayahquiz_profile_v13_';

  const THEME_CLOUD_KEY =
    'ayahquest_theme';


  /* =========================================================
     TELEGRAM
  ========================================================= */

  const tg =
    window.Telegram?.WebApp || null;


  if (tg) {

    try {

      tg.ready();
      tg.expand();

    } catch (_) {}

  }


  let telegramUser =
    tg?.initDataUnsafe?.user || null;

  let currentInitData =
    tg?.initData || '';


  /* =========================================================
     USER STORAGE KEY
  ========================================================= */

  const userKey =
    telegramUser?.id
      ? `${STORAGE_PREFIX}${telegramUser.id}`
      : `${STORAGE_PREFIX}guest`;


  try {

    localStorage.removeItem(
      LEGACY_KEY
    );

  } catch (_) {}


  /* =========================================================
     DEFAULT STATE
  ========================================================= */

  const defaults = {

    name:
      telegramUser
        ? [
            telegramUser.first_name,
            telegramUser.last_name
          ]
          .filter(Boolean)
          .join(' ')
        : 'Guest',

    username:
      telegramUser?.username
        ? '@' + telegramUser.username
        : '',

    avatar:'🕌',

    xp:0,

    answered:0,

    correct:0,

    streak:0,

    lastActive:'',

    dailyDone:0,

    dailyDate:'',

    mistakes:[],

    bookmarks:[],

    history:[],

    isPro:false,

    customName:'',

    /*
      IMPORTANT:
      Light is now the default.
      The user's selected theme is stored locally
      and also in Telegram CloudStorage.
    */

    theme:'light'

  };


  let state =
    loadState();


  let serverUser =
    null;


  let surahs =
    [];


  let juzCache =
    {};


  let currentAyah =
    null;


  let currentOptions =
    [];


  let answeredThisQuestion =
    false;


  let session = {

    mode:'random',

    filter:null,

    q:0,

    score:0,

    xp:0,

    questions:[]

  };


  const audio =
    document.getElementById('audio');


  /* =========================================================
     STATE
  ========================================================= */

  function loadState() {

    try {

      const saved =
        JSON.parse(
          localStorage.getItem(userKey) ||
          'null'
        );

      return {
        ...defaults,
        ...(saved || {})
      };

    } catch (_) {

      return {
        ...defaults
      };

    }

  }


  function saveState() {

    try {

      localStorage.setItem(
        userKey,
        JSON.stringify(state)
      );

    } catch (_) {}

  }


  /* =========================================================
     THEME
  ========================================================= */

  function applyTheme() {

    /*
      Only light or dark are used.

      We intentionally do NOT use "system"
      because the user should control the app theme.
    */

    const saved =
      state.theme === 'dark'
        ? 'dark'
        : 'light';


    const dark =
      saved === 'dark';


    document.documentElement.dataset.theme =
      dark
        ? 'dark'
        : 'light';


    const meta =
      document.getElementById(
        'themeColorMeta'
      );


    if (meta) {

      meta.content =
        dark
          ? '#0b1512'
          : '#f7faf8';

    }


    const btn =
      document.getElementById(
        'themeToggleBtn'
      );


    if (btn) {

      btn.textContent =
        dark
          ? '☀️ Light'
          : '🌙 Dark';

    }


    /*
      Keep Telegram's native UI synchronized.
    */

    if (tg) {

      try {

        if (
          typeof tg.setHeaderColor === 'function'
        ) {

          tg.setHeaderColor(
            dark
              ? '#0b1512'
              : '#f7faf8'
          );

        }


        if (
          typeof tg.setBackgroundColor === 'function'
        ) {

          tg.setBackgroundColor(
            dark
              ? '#0b1512'
              : '#f7faf8'
          );

        }

      } catch (_) {}

    }

  }


  function saveThemeToCloud(theme) {

    if (!tg?.CloudStorage) {
      return;
    }


    try {

      tg.CloudStorage.setItem(
        THEME_CLOUD_KEY,
        theme,
        () => {}
      );

    } catch (_) {}

  }


  function toggleTheme() {

    const isDark =
      document.documentElement.dataset.theme === 'dark';


    state.theme =
      isDark
        ? 'light'
        : 'dark';


    /*
      Save immediately to localStorage.
      This survives closing/reopening the Mini App.
    */

    saveState();


    /*
      Also save to Telegram CloudStorage.
      This gives another persistence layer.
    */

    saveThemeToCloud(
      state.theme
    );


    applyTheme();

  }


  function loadCloudTheme() {

    /*
      Always apply localStorage immediately.
      This prevents the theme from flashing/resetting.
    */

    applyTheme();


    if (!tg?.CloudStorage) {
      return;
    }


    try {

      tg.CloudStorage.getItem(
        THEME_CLOUD_KEY,
        (error, value) => {

          if (
            !error &&
            (value === 'dark' ||
             value === 'light')
          ) {

            state.theme =
              value;

            saveState();

          }


          /*
            Reapply after CloudStorage responds.
          */

          applyTheme();

        }
      );

    } catch (_) {

      applyTheme();

    }

  }


  /* =========================================================
     DATE / DAILY
  ========================================================= */

  function todayKey() {

    const d =
      new Date();


    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;

  }


  function syncDaily() {

    const today =
      todayKey();


    if (
      state.dailyDate !== today
    ) {

      const previous =
        state.dailyDate;


      if (previous) {

        const prev =
          new Date(previous);

        const now =
          new Date(today);

        const diff =
          Math.round(
            (now - prev) /
            86400000
          );


        if (diff > 1) {

          state.streak =
            0;

        }

      }


      state.dailyDate =
        today;

      state.dailyDone =
        0;


      saveState();

    }

  }


  function dailyGoal() {

    return 10;

  }


  function level() {

    return Math.max(
      1,
      Math.floor(
        state.xp / 100
      ) + 1
    );

  }


  function accuracy() {

    return state.answered

      ? Math.round(
          state.correct /
          state.answered *
          100
        )

      : 0;

  }


  /* =========================================================
     SECURITY / HTML
  ========================================================= */

  function escapeHTML(v) {

    return String(
      v ?? ''
    ).replace(
      /[&<>"']/g,
      c =>
        ({
          '&':'&amp;',
          '<':'&lt;',
          '>':'&gt;',
          '"':'&quot;',
          "'":'&#039;'
        }[c])
    );

  }


  /* =========================================================
     TOAST
  ========================================================= */

  function toast(message) {

    const el =
      document.getElementById(
        'toast'
      );


    el.textContent =
      message;


    el.classList.remove(
      'hidden'
    );


    clearTimeout(
      toast.t
    );


    toast.t =
      setTimeout(
        () =>
          el.classList.add(
            'hidden'
          ),
        2600
      );

  }


  /* =========================================================
     VIEWS
  ========================================================= */

  function showView(name) {

    [
      'homeView',
      'quizView',
      'filtersView',
      'statsView'
    ]
    .forEach(
      id =>
        document
          .getElementById(id)
          .classList.add('hidden')
    );


    document
      .getElementById(
        name + 'View'
      )
      .classList.remove('hidden');


    document
      .querySelectorAll(
        '.nav button'
      )
      .forEach(
        b =>
          b.classList.toggle(
            'active',
            b.dataset.nav === name
          )
      );


    window.scrollTo({
      top:0,
      behavior:'smooth'
    });


    if (name === 'stats') {

      renderStats();

    }

  }


  function openModal(id) {

    document
      .getElementById(id)
      .classList.remove('hidden');

  }


  function closeModal(id) {

    document
      .getElementById(id)
      .classList.add('hidden');

  }


  /* =========================================================
     HEADER
  ========================================================= */

  function renderHeader() {

    const name =
      state.customName ||
      state.name ||
      'Quran learner';


    document.getElementById(
      'profileName'
    ).textContent =
      name.split(' ')[0];


    document.getElementById(
      'welcomeName'
    ).textContent =
      name.split(' ')[0];


    document.getElementById(
      'avatar'
    ).textContent =
      state.avatar;


    document.getElementById(
      'streakValue'
    ).textContent =
      state.streak;


    document.getElementById(
      'xpValue'
    ).textContent =
      state.xp;


    document.getElementById(
      'answeredValue'
    ).textContent =
      state.answered;


    document.getElementById(
      'accuracyValue'
    ).textContent =
      accuracy() + '%';


    document.getElementById(
      'dailyDone'
    ).textContent =
      state.dailyDone;


    document.getElementById(
      'dailyGoal'
    ).textContent =
      dailyGoal();


    document.getElementById(
      'dailyProgress'
    ).style.width =
      Math.min(
        100,
        state.dailyDone /
        dailyGoal() *
        100
      ) + '%';


    const tier =
      state.isPro
        ? 'PRO ✦'
        : 'FREE';


    document.getElementById(
      'tierPill'
    ).textContent =
      tier;


    document
      .getElementById(
        'proHomeBtn'
      )
      .classList.remove(
        'hidden'
      );


    document
      .getElementById(
        'proHomeBtn'
      )
      .querySelector('div')
      .textContent =
        state.isPro
          ? '✦ Pro active'
          : '✦ Unlock Pro';

  }


  /* =========================================================
     API
  ========================================================= */

  async function api(
    path,
    options = {}
  ) {

    const res =
      await fetch(
        API_BASE + path,
        {
          ...options,

          headers:{
            'Content-Type':
              'application/json',

            ...(options.headers || {})
          }

        }
      );


    let data =
      {};


    try {

      data =
        await res.json();

    } catch (_) {}


    if (!res.ok) {

      throw new Error(
        data.error ||
        `Request failed (${res.status})`
      );

    }


    return data;

  }


  /* =========================================================
     TELEGRAM AUTH
  ========================================================= */

  async function authenticate() {

    if (!currentInitData) {
      return;
    }


    try {

      serverUser =
        await api(
          '/api/auth',
          {
            method:'POST',

            body:
              JSON.stringify({
                initData:
                  currentInitData
              })

          }
        );


      if (
        serverUser.user
      ) {

        telegramUser =
          serverUser.user;


        if (!state.customName) {

          state.name =
            [
              telegramUser.first_name,
              telegramUser.last_name
            ]
            .filter(Boolean)
            .join(' ') ||
            state.name;

        }


        state.username =
          telegramUser.username

            ? '@' +
              telegramUser.username

            : state.username;


        state.isPro =
          !!serverUser.user.isPro;


        saveState();


        renderHeader();

      }

    } catch (e) {

      console.warn(
        'Telegram authentication failed:',
        e
      );


      toast(
        'Connected in offline mode'
      );

    }

  }


  /* =========================================================
     QURAN DATA
  ========================================================= */

  async function loadSurahs() {

    if (surahs.length) {
      return surahs;
    }


    try {

      const r =
        await fetch(
          `${ALQURAN}/surah`
        );


      const j =
        await r.json();


      if (j.code !== 200) {

        throw new Error(
          'Surah API failed'
        );

      }


      surahs =
        j.data;

    } catch (_) {

      surahs =
        Array.from(
          {length:114},
          (_,i) => ({
            number:i+1,
            englishName:
              `Surah ${i+1}`,
            name:
              `سورة ${i+1}`,
            numberOfAyahs:286
          })
        );

    }


    return surahs;

  }


  async function fetchAyahByNumber(
    globalNumber
  ) {

    const url =
      `${ALQURAN}/ayah/${globalNumber}/editions/quran-uthmani,en.sahih`;


    const r =
      await fetch(url);


    const j =
      await r.json();


    if (
      j.code !== 200 ||
      !Array.isArray(j.data)
    ) {

      throw new Error(
        'Ayah unavailable'
      );

    }


    const ar =
      j.data.find(
        x =>
          x.edition?.identifier ===
          'quran-uthmani'
      ) ||
      j.data[0];


    const en =
      j.data.find(
        x =>
          x.edition?.identifier ===
          'en.sahih'
      ) ||
      {};


    return {

      globalNumber:
        ar.number,

      numberInSurah:
        ar.numberInSurah,

      juz:
        ar.juz,

      arabic:
        ar.text,

      english:
        en.text || '',

      surahNumber:
        ar.surah.number,

      surahName:
        ar.surah.englishName,

      surahArabic:
        ar.surah.name

    };

  }


  async function fetchSurahAyahs(
    surahNumber
  ) {

    const r =
      await fetch(
        `${ALQURAN}/surah/${surahNumber}/quran-uthmani`
      );


    const j =
      await r.json();


    if (j.code !== 200) {

      throw new Error(
        'Surah unavailable'
      );

    }


    return j.data.ayahs;

  }


  async function fetchJuz(
    juz
  ) {

    if (
      juzCache[juz]
    ) {

      return juzCache[juz];

    }


    const r =
      await fetch(
        `${ALQURAN}/juz/${juz}/quran-uthmani`
      );


    const j =
      await r.json();


    if (j.code !== 200) {

      throw new Error(
        'Juz unavailable'
      );

    }


    juzCache[juz] =
      j.data.ayahs;


    return juzCache[juz];

  }


  function randomItem(arr) {

    return arr[
      Math.floor(
        Math.random() *
        arr.length
      )
    ];

  }


  /* =========================================================
     QUESTION SELECTION
  ========================================================= */

  async function chooseGlobalNumber() {

    const f =
      session.filter;


    if (
      session.mode === 'mistakes' ||
      session.mode === 'bookmarks'
    ) {

      const pool =
        f || [];


      if (!pool.length) {

        throw new Error(
          session.mode === 'mistakes'
            ? 'No mistakes yet — great job!'
            : 'No bookmarks yet.'
        );

      }


      return randomItem(
        pool
      ).globalNumber;

    }


    if (
      session.mode === 'juz'
    ) {

      const arr =
        await fetchJuz(
          Number(f)
        );


      return randomItem(
        arr
      ).number;

    }


    if (
      session.mode === 'surah'
    ) {

      const arr =
        await fetchSurahAyahs(
          Number(f)
        );


      return randomItem(
        arr
      ).number;

    }


    if (
      session.mode === 'daily'
    ) {

      const seed =
        Number(
          todayKey()
            .replaceAll(
              '-',
              ''
            )
        );


      return (
        seed % 6236
      ) + 1;

    }


    return (
      Math.floor(
        Math.random() *
        6236
      )
    ) + 1;

  }


  async function buildOptions(
    correctNumber
  ) {

    await loadSurahs();


    const correct =
      surahs.find(
        s =>
          s.number ===
          currentAyah.surahNumber
      );


    const pool =
      surahs.filter(
        s =>
          s.number !==
          currentAyah.surahNumber
      );


    const picks =
      [];


    while (
      picks.length < 3 &&
      pool.length
    ) {

      const p =
        randomItem(pool);


      if (
        !picks.some(
          x =>
            x.number ===
            p.number
        )
      ) {

        picks.push(p);

      }

    }


    return [
      correct,
      ...picks
    ].sort(
      () =>
        Math.random() -
        .5
    );

  }


  /* =========================================================
     QUIZ
  ========================================================= */

  async function startQuiz(
    mode='random',
    filter=null
  ) {

    session = {

      mode,

      filter,

      q:0,

      score:0,

      xp:0,

      questions:[]

    };


    showView(
      'quiz'
    );


    await loadQuestion();

  }


  async function loadQuestion() {

    answeredThisQuestion =
      false;


    document
      .getElementById(
        'quizLoading'
      )
      .classList.remove(
        'hidden'
      );


    document
      .getElementById(
        'quizCard'
      )
      .classList.add(
        'hidden'
      );


    document
      .getElementById(
        'answerFeedback'
      )
      .classList.add(
        'hidden'
      );


    document
      .getElementById(
        'nextBtn'
      )
      .classList.add(
        'hidden'
      );


    document
      .getElementById(
        'audioBtn'
      )
      .textContent =
      '🔊 Listen';


    try {

      const n =
        await chooseGlobalNumber();


      currentAyah =
        await fetchAyahByNumber(
          n
        );


      currentOptions =
        await buildOptions(
          n
        );


      renderQuestion();

    } catch (e) {

      document.getElementById(
        'quizLoading'
      ).innerHTML =

        `<div class="text-3xl mb-2">
          📖
        </div>

        <div class="font-bold">
          Could not load this question
        </div>

        <div class="muted text-sm mt-2">
          ${escapeHTML(e.message)}
        </div>

        <button
          class="btn btn-primary mt-4"
          onclick="location.reload()"
        >
          Retry
        </button>`;

      return;

    }


    document
      .getElementById(
        'quizLoading'
      )
      .classList.add(
        'hidden'
      );


    document
      .getElementById(
        'quizCard'
      )
      .classList.remove(
        'hidden'
      );

  }


  function renderQuestion() {

    const q =
      session.q + 1;


    document.getElementById(
      'qNumber'
    ).textContent =
      q;


    document.getElementById(
      'quizProgress'
    ).style.width =
      (
        q / 10 * 100
      ) + '%';


    document.getElementById(
      'sessionScore'
    ).textContent =
      session.score;


    document.getElementById(
      'ayahArabic'
    ).textContent =
      currentAyah.arabic;


    document.getElementById(
      'bookmarkBtn'
    ).textContent =

      state.bookmarks.some(
        x =>
          x.globalNumber ===
          currentAyah.globalNumber
      )

        ? '★'

        : '☆';


    document
      .getElementById(
        'translationBox'
      )
      .classList.add(
        'hidden'
      );


    document
      .getElementById(
        'translationBox'
      )
      .innerHTML =
      '';


    document
      .getElementById(
        'answerFeedback'
      )
      .classList.add(
        'hidden'
      );


    document
      .getElementById(
        'recitationControls'
      )
      .classList.remove(
        'hidden'
      );


    document
      .getElementById(
        'audioBtn'
      )
      .classList.toggle(
        'locked-control',
        !state.isPro
      );


    document
      .getElementById(
        'speedSelect'
      )
      .disabled =
      !state.isPro;


    const box =
      document.getElementById(
        'options'
      );


    box.innerHTML =
      '';


    currentOptions.forEach(
      opt => {

        const b =
          document.createElement(
            'button'
          );


        b.className =
          'option';


        b.textContent =
          `${opt.number}. ${opt.englishName}`;


        b.addEventListener(
          'click',
          () =>
            answer(
              opt.number,
              b
            )
        );


        box.appendChild(
          b
        );

      }
    );

  }


  function answer(
    selected,
    clickedButton
  ) {

    if (
      answeredThisQuestion
    ) {
      return;
    }


    answeredThisQuestion =
      true;


    const correct =
      selected ===
      currentAyah.surahNumber;


    document
      .querySelectorAll(
        '.option'
      )
      .forEach(
        btn => {

          btn.disabled =
            true;


          const num =
            Number(
              btn.textContent
                .split('.')[0]
            );


          if (
            num ===
            currentAyah.surahNumber
          ) {

            btn.classList.add(
              'correct'
            );

          }

        }
      );


    if (!correct) {

      clickedButton.classList.add(
        'wrong'
      );

    }


    const feedback =
      document.getElementById(
        'answerFeedback'
      );


    feedback.classList.remove(
      'hidden'
    );


    const translation =
      document.getElementById(
        'translationBox'
      );


    translation.innerHTML =

      `<b>English translation</b>

       <div class="mt-1">
         ${escapeHTML(
           currentAyah.english
         )}
       </div>`;


    translation.classList.remove(
      'hidden'
    );


    feedback.innerHTML =

      correct

        ? `<b>
             Correct — mashaAllah! 🎉
           </b>

           <div class="muted text-sm mt-1">
             ${escapeHTML(
               currentAyah.surahName
             )}

             · Ayah
             ${currentAyah.numberInSurah}
           </div>`

        : `<b>
             Not quite.
           </b>

           <div class="muted text-sm mt-1">
             The answer is

             <b>
               ${escapeHTML(
                 currentAyah.surahName
               )}
             </b>

             · Ayah
             ${currentAyah.numberInSurah}
           </div>`;


    feedback.style.background =
      correct
        ? 'var(--success-bg)'
        : 'var(--wrong-bg)';


    feedback.style.border =
      `1px solid ${
        correct
          ? 'var(--success-border)'
          : 'var(--wrong-border)'
      }`;


    state.answered++;

    state.dailyDone++;


    if (correct) {

      state.correct++;

      session.score++;

      const earned =
        10;

      state.xp +=
        earned;

      session.xp +=
        earned;

    } else {

      const earned =
        2;

      state.xp +=
        earned;

      session.xp +=
        earned;


      if (
        !state.mistakes.some(
          x =>
            x.globalNumber ===
            currentAyah.globalNumber
        )
      ) {

        state.mistakes.push({

          globalNumber:
            currentAyah.globalNumber,

          surahNumber:
            currentAyah.surahNumber,

          numberInSurah:
            currentAyah.numberInSurah,

          surahName:
            currentAyah.surahName

        });

      }

    }


    session.questions.push({

      globalNumber:
        currentAyah.globalNumber,

      correct

    });


    state.history.unshift({

      date:
        todayKey(),

      globalNumber:
        currentAyah.globalNumber,

      correct

    });


    state.history =
      state.history.slice(
        0,
        100
      );


    if (
      state.dailyDone === 1
    ) {

      state.streak =
        Math.max(
          1,
          state.streak + 1
        );

    }


    saveState();

    renderHeader();


    document
      .getElementById(
        'nextBtn'
      )
      .classList.remove(
        'hidden'
      );

  }


  function nextQuestion() {

    session.q++;


    if (
      session.q >= 10
    ) {

      finishQuiz();

    } else {

      loadQuestion();

    }

  }


  function finishQuiz() {

    document.getElementById(
      'resultScore'
    ).textContent =
      `${session.score}/10`;


    document.getElementById(
      'resultCorrect'
    ).textContent =
      session.score;


    document.getElementById(
      'resultXP'
    ).textContent =
      `+${session.xp}`;


    document.getElementById(
      'resultStreak'
    ).textContent =
      state.streak;


    openModal(
      'resultModal'
    );


    renderHeader();

    renderStats();

  }


  /* =========================================================
     BOOKMARKS
  ========================================================= */

  function toggleBookmark() {

    if (!state.isPro) {

      openModal(
        'proModal'
      );

      toast(
        'Bookmarks are a Pro feature.'
      );

      return;

    }


    if (!currentAyah) {
      return;
    }


    const i =
      state.bookmarks.findIndex(
        x =>
          x.globalNumber ===
          currentAyah.globalNumber
      );


    if (i >= 0) {

      state.bookmarks.splice(
        i,
        1
      );


      document.getElementById(
        'bookmarkBtn'
      ).textContent =
        '☆';


      toast(
        'Bookmark removed'
      );

    } else {

      state.bookmarks.push({

        globalNumber:
          currentAyah.globalNumber,

        surahNumber:
          currentAyah.surahNumber,

        numberInSurah:
          currentAyah.numberInSurah,

        surahName:
          currentAyah.surahName

      });


      document.getElementById(
        'bookmarkBtn'
      ).textContent =
        '★';


      toast(
        'Ayah bookmarked'
      );

    }


    saveState();

  }


  /* =========================================================
     AUDIO
  ========================================================= */

  function playAudio() {

    if (!state.isPro) {

      openModal(
        'proModal'
      );

      toast(
        'Recitation is a Pro feature.'
      );

      return;

    }


    if (!currentAyah) {
      return;
    }


    audio.pause();


    const url =
      `https://cdn.islamic.network/quran/audio/128/ar.alafasy/${currentAyah.globalNumber}.mp3`;


    if (
      audio.src !== url
    ) {

      audio.src =
        url;

    }


    audio.currentTime =
      0;


    audio.preload =
      'auto';


    audio.playbackRate =
      Number(
        document.getElementById(
          'speedSelect'
        ).value
      );


    audio.play()
      .then(
        () => {

          document.getElementById(
            'audioBtn'
          ).textContent =
            '⏸ Pause';

        }
      )
      .catch(
        () =>
          toast(
            'Audio could not start'
          )
      );

  }


  function requirePro(
    feature
  ) {

    if (state.isPro) {
      return true;
    }


    openModal(
      'proModal'
    );


    toast(
      `${feature} is a Pro feature ✦`
    );


    return false;

  }


  /* =========================================================
     FILTERS
  ========================================================= */

  function renderFilters() {

    const j =
      document.getElementById(
        'juzGrid'
      );


    j.innerHTML =
      '';


    for (
      let i=1;
      i<=30;
      i++
    ) {

      const b =
        document.createElement(
          'button'
        );


      b.className =
        'btn btn-ghost pro-feature pro-lock';


      b.textContent =
        `Juz ${i}`;


      b.addEventListener(
        'click',
        () => {

          if (
            requirePro(
              'Juz selection'
            )
          ) {

            startQuiz(
              'juz',
              i
            );

          }

        }
      );


      j.appendChild(
        b
      );

    }


    renderSurahs();

  }


  function renderSurahs(
    search=''
  ) {

    const box =
      document.getElementById(
        'surahGrid'
      );


    const q =
      search
        .trim()
        .toLowerCase();


    box.innerHTML =
      '';


    surahs
      .filter(
        s =>
          !q ||
          s.englishName
            .toLowerCase()
            .includes(q) ||
          s.number === Number(q)
      )
      .forEach(
        s => {

          const b =
            document.createElement(
              'button'
            );


          b.className =
            'btn btn-ghost text-left pro-feature pro-lock';


          b.innerHTML =

            `<b>
              ${s.number}.
              ${escapeHTML(
                s.englishName
              )}
            </b>

            <span class="muted text-xs ml-2">
              ${escapeHTML(
                s.name
              )}
            </span>`;


          b.addEventListener(
            'click',
            () => {

              if (
                requirePro(
                  'Surah selection'
                )
              ) {

                startQuiz(
                  'surah',
                  s.number
                );

              }

            }
          );


          box.appendChild(
            b
          );

        }
      );

  }


  /* =========================================================
     MEMORY MAP
  ========================================================= */

  function renderMemoryMap() {

    const box =
      document.getElementById(
        'memoryMap'
      );


    if (!state.isPro) {

      box.innerHTML =

        `<button
          type="button"
          class="col-span-6 card p-4 text-center muted pro-feature"
          data-pro-feature="memorization map"
        >
          🔒 Memorization map ·
          <b>Unlock Pro</b>
        </button>`;


      return;

    }


    box.innerHTML =

      Array.from(
        {length:30},
        (_,i) => {

          const n =
            i + 1;


          const intensity =
            Math.min(
              4,
              Math.floor(
                state.answered /
                30
              )
            );


          return `

            <div
              class="rounded-xl h-10 flex items-center justify-center text-xs font-bold"

              style="
                background:${
                  intensity

                    ? [
                        '#eaf5ef',
                        '#d5eee2',
                        '#b6e1ce',
                        '#82cdb0',
                        '#45b991'
                      ][intensity]

                    : '#f2f6f4'
                };

                color:#31584b
              "
            >
              ${n}
            </div>

          `;

        }
      ).join('');

  }


  /* =========================================================
     STATS
  ========================================================= */

  function renderStats() {

    document.getElementById(
      'statsXP'
    ).textContent =
      state.xp;


    document.getElementById(
      'statsLevel'
    ).textContent =
      level();


    document.getElementById(
      'statsCorrect'
    ).textContent =
      state.correct;


    document.getElementById(
      'statsMistakes'
    ).textContent =
      state.mistakes.length;


    const achievements = [

      [
        '🌱',
        'First Step',
        state.answered >= 1,
        'Answer your first question'
      ],

      [
        '🔥',
        'Consistent',
        state.streak >= 3,
        'Reach a 3-day streak'
      ],

      [
        '🎯',
        'Sharpshooter',
        accuracy() >= 80 &&
        state.answered >= 10,
        'Reach 80% accuracy'
      ],

      [
        '📖',
        '100 Ayahs',
        state.answered >= 100,
        'Answer 100 questions'
      ],

      [
        '💎',
        'Level 10',
        level() >= 10,
        'Reach level 10'
      ],

      [
        '🔖',
        'Collector',
        state.bookmarks.length >= 10,
        'Bookmark 10 ayahs'
      ]

    ];


    document.getElementById(
      'achievements'
    ).innerHTML =

      achievements
        .map(
          a =>

            `<button
              type="button"

              class="card p-3 flex items-center gap-3 text-left w-full ${
                a[2]
                  ? ''
                  : 'opacity-45 pro-feature'
              }"

              data-pro-feature="badges & achievements"
            >

              <div class="text-2xl">
                ${a[0]}
              </div>

              <div>

                <b>
                  ${a[1]}
                </b>

                <div class="muted text-xs">
                  ${a[3]}
                </div>

              </div>

              <div class="ml-auto">
                ${a[2] ? '✓' : '🔒'}
              </div>

            </button>`
        )
        .join('');


    renderMemoryMap();


    document
      .querySelectorAll(
        '[data-pro-feature]'
      )
      .forEach(
        el => {

          if (
            !el.dataset.boundPro
          ) {

            el.dataset.boundPro =
              '1';


            el.addEventListener(
              'click',
              () =>
                requirePro(
                  el.dataset.proFeature ||
                  'This feature'
                )
            );

          }

        }
      );

  }


  /* =========================================================
     PROFILE
  ========================================================= */

  function renderProfile() {

    document.getElementById(
      'profileAvatarBig'
    ).textContent =
      state.avatar;


    document.getElementById(
      'profileFullName'
    ).textContent =
      state.customName ||
      state.name;


    document.getElementById(
      'displayNameInput'
    ).value =
      state.customName ||
      state.name ||
      '';


    document.getElementById(
      'profileUsername'
    ).textContent =
      state.username ||
      'Telegram username not set';


    document.getElementById(
      'profileTier'
    ).textContent =
      state.isPro
        ? 'PRO ✦'
        : 'FREE';


    document.getElementById(
      'pStreak'
    ).textContent =
      state.streak;


    document.getElementById(
      'pXP'
    ).textContent =
      state.xp;


    document.getElementById(
      'pAccuracy'
    ).textContent =
      accuracy() + '%';

  }


  /* =========================================================
     REFRESH PRO
  ========================================================= */

  async function refreshServerPro() {

    if (!currentInitData) {
      return;
    }


    try {

      const data =
        await api(
          '/api/auth',
          {
            method:'POST',

            body:
              JSON.stringify({
                initData:
                  currentInitData
              })

          }
        );


      if (data.user) {

        serverUser =
          data;


        state.isPro =
          !!data.user.isPro;


        saveState();


        renderHeader();

      }

    } catch (_) {}

  }


  /* =========================================================
     TELEGRAM STARS
  ========================================================= */

  async function payStars() {

    if (!currentInitData) {

      toast(
        'Open Ayah Quest from Telegram to use Stars'
      );

      return;

    }


    const btn =
      document.getElementById(
        'starsBtn'
      );


    btn.disabled =
      true;


    btn.textContent =
      'Creating invoice…';


    try {

      const data =
        await api(
          '/api/create-invoice',
          {
            method:'POST',

            body:
              JSON.stringify({
                initData:
                  currentInitData
              })

          }
        );


      if (!data.invoiceLink) {

        throw new Error(
          'Invoice unavailable'
        );

      }


      if (
        tg?.openInvoice
      ) {

        tg.openInvoice(
          data.invoiceLink,
          async status => {

            if (
              status === 'paid'
            ) {

              toast(
                'Payment received. Verifying Pro…'
              );


              for (
                let i=0;
                i<5;
                i++
              ) {

                await new Promise(
                  r =>
                    setTimeout(
                      r,
                      1200
                    )
                );


                await refreshServerPro();


                if (
                  state.isPro
                ) {
                  break;
                }

              }


              if (
                state.isPro
              ) {

                closeModal(
                  'proModal'
                );


                toast(
                  'Pro activated ✦'
                );

              } else {

                toast(
                  'Payment received; activation is still processing.'
                );

              }


            } else if (
              status === 'cancelled'
            ) {

              toast(
                'Payment cancelled'
              );


            } else if (
              status === 'failed'
            ) {

              toast(
                'Payment failed'
              );


            } else if (
              status === 'pending'
            ) {

              toast(
                'Payment pending'
              );

            }

          }
        );

      } else {

        window.location.href =
          data.invoiceLink;

      }

    } catch(e) {

      toast(
        e.message
      );

    } finally {

      btn.disabled =
        false;

      btn.textContent =
        'Pay with Telegram Stars';

    }

  }


  /* =========================================================
     TELEBIRR
  ========================================================= */

  async function requestTelebirr() {

    if (!currentInitData) {

      toast(
        'Open Ayah Quest from Telegram first'
      );

      return;

    }


    const ref =
      document
        .getElementById(
          'telebirrRef'
        )
        .value
        .trim();


    if (!ref) {

      toast(
        'Enter your Telebirr transaction/reference ID'
      );

      return;

    }


    const btn =
      document.getElementById(
        'telebirrBtn'
      );


    btn.disabled =
      true;


    btn.textContent =
      'Submitting…';


    try {

      await api(
        '/api/pro/telebirr',
        {
          method:'POST',

          body:
            JSON.stringify({

              initData:
                currentInitData,

              reference:
                ref,

              displayName:
                state.customName ||
                state.name ||
                ''

            })

        }
      );


      toast(
        'Request sent. Wait for admin approval.'
      );


      document.getElementById(
        'telebirrRef'
      ).value =
        '';


    } catch(e) {

      toast(
        e.message
      );

    } finally {

      btn.disabled =
        false;

      btn.textContent =
        'Submit payment request';

    }

  }


  /* =========================================================
     FILTER START
  ========================================================= */

  function startFromFilter(
    mode
  ) {

    if (
      (
        mode === 'mistakes' ||
        mode === 'bookmarks' ||
        mode === 'daily'
      ) &&
      !state.isPro
    ) {

      openModal(
        'proModal'
      );


      toast(
        'This feature is part of Pro ✦'
      );


      return;

    }


    if (
      mode === 'mistakes'
    ) {

      startQuiz(
        'mistakes',
        state.mistakes
      );


    } else if (
      mode === 'bookmarks'
    ) {

      startQuiz(
        'bookmarks',
        state.bookmarks
      );


    } else if (
      mode === 'daily'
    ) {

      startQuiz(
        'daily'
      );


    } else {

      startQuiz(
        'random'
      );

    }

  }


  /* =========================================================
     GLOBAL ACTION HANDLER
  ========================================================= */

  document.addEventListener(
    'click',
    e => {

      const action =
        e.target
          .closest(
            '[data-action]'
          )
          ?.dataset.action;


      if (
        action === 'home'
      ) {

        closeModal(
          'resultModal'
        );

        showView(
          'home'
        );

      }


      if (
        action === 'start'
      ) {

        closeModal(
          'resultModal'
        );

        startQuiz(
          'random'
        );

      }


      if (
        action === 'filters'
      ) {

        showView(
          'filters'
        );


        loadSurahs()
          .then(
            renderFilters
          )
          .catch(
            () => {}
          );

      }


      if (
        action === 'pro'
      ) {

        openModal(
          'proModal'
        );

      }

    }
  );


  /* =========================================================
     NAVIGATION
  ========================================================= */

  document
    .querySelectorAll(
      '[data-nav]'
    )
    .forEach(
      b =>
        b.addEventListener(
          'click',
          () => {

            const n =
              b.dataset.nav;


            if (
              n === 'profile'
            ) {

              renderProfile();


              openModal(
                'profileModal'
              );


            } else {

              showView(
                n
              );

            }


            if (
              n === 'filters'
            ) {

              loadSurahs()
                .then(
                  renderFilters
                )
                .catch(
                  () => {}
                );

            }

          }
        )
    );


  /* =========================================================
     MODAL CLOSE BUTTONS
  ========================================================= */

  document
    .querySelectorAll(
      '[data-close]'
    )
    .forEach(
      b =>
        b.addEventListener(
          'click',
          () =>
            closeModal(
              b.dataset.close
            )
        )
    );


  /* =========================================================
     CLOSE MODAL BY OUTSIDE TAP
  ========================================================= */

  document
    .querySelectorAll(
      '.modal'
    )
    .forEach(
      m =>
        m.addEventListener(
          'click',
          e => {

            if (
              e.target === m
            ) {

              closeModal(
                m.id
              );

            }

          }
        )
    );


  /* =========================================================
     PROFILE BUTTON
  ========================================================= */

  document
    .getElementById(
      'profileBtn'
    )
    .addEventListener(
      'click',
      () => {

        renderProfile();

        openModal(
          'profileModal'
        );

      }
    );


  /* =========================================================
     NEXT QUESTION
  ========================================================= */

  document
    .getElementById(
      'nextBtn'
    )
    .addEventListener(
      'click',
      nextQuestion
    );


  /* =========================================================
     BOOKMARK
  ========================================================= */

  document
    .getElementById(
      'bookmarkBtn'
    )
    .addEventListener(
      'click',
      toggleBookmark
    );


  /* =========================================================
     AUDIO
  ========================================================= */

  document
    .getElementById(
      'audioBtn'
    )
    .addEventListener(
      'click',
      event => {

        event.stopPropagation();


        if (
          !audio.paused
        ) {

          audio.pause();


          document.getElementById(
            'audioBtn'
          ).textContent =
            '🔊 Listen';

        } else {

          playAudio();

        }

      }
    );


  document
    .getElementById(
      'speedSelect'
    )
    .addEventListener(
      'change',
      () => {

        if (currentAyah) {

          audio.playbackRate =
            Number(
              document.getElementById(
                'speedSelect'
              ).value
            );

        }

      }
    );


  audio.addEventListener(
    'ended',
    () =>
      document.getElementById(
        'audioBtn'
      ).textContent =
        '▶︎ Recitation'
  );


  audio.addEventListener(
    'pause',
    () => {

      if (!audio.ended) {

        document.getElementById(
          'audioBtn'
        ).textContent =
          '▶︎ Recitation';

      }

    }
  );


  audio.addEventListener(
    'play',
    () =>
      document.getElementById(
        'audioBtn'
      ).textContent =
        '⏸ Pause'
  );


  /* =========================================================
     PAYMENT BUTTONS
  ========================================================= */

  document
    .getElementById(
      'starsBtn'
    )
    .addEventListener(
      'click',
      payStars
    );


  document
    .getElementById(
      'telebirrBtn'
    )
    .addEventListener(
      'click',
      requestTelebirr
    );


  /* =========================================================
     THEME BUTTON
  ========================================================= */

  document
    .getElementById(
      'themeToggleBtn'
    )
    .addEventListener(
      'click',
      toggleTheme
    );


  /* =========================================================
     SURAH SEARCH
  ========================================================= */

  document
    .getElementById(
      'surahSearch'
    )
    .addEventListener(
      'input',
      e =>
        renderSurahs(
          e.target.value
        )
    );


  /* =========================================================
     FILTER BUTTONS
  ========================================================= */

  document
    .querySelectorAll(
      '[data-filter]'
    )
    .forEach(
      b =>
        b.addEventListener(
          'click',
          () =>
            startFromFilter(
              b.dataset.filter
            )
        )
    );


  /* =========================================================
     DISPLAY NAME
  ========================================================= */

  document
    .getElementById(
      'saveNameBtn'
    )
    .addEventListener(
      'click',
      () => {

        const value =
          document
            .getElementById(
              'displayNameInput'
            )
            .value
            .trim()
            .replace(
              /\s+/g,
              ' '
            );


        if (!value) {

          toast(
            'Please enter a name.'
          );


          return;

        }


        state.customName =
          value.slice(
            0,
            30
          );


        state.name =
          state.customName;


        saveState();


        renderHeader();

        renderProfile();


        toast(
          'Display name updated ✨'
        );

      }
    );


  /* =========================================================
     PRO FEATURE HANDLERS
  ========================================================= */

  document
    .querySelectorAll(
      '[data-pro-feature]'
    )
    .forEach(
      el => {

        if (
          !el.dataset.boundPro
        ) {

          el.dataset.boundPro =
            '1';


          el.addEventListener(
            'click',
            () =>
              requirePro(
                el.dataset.proFeature ||
                'This feature'
              )
          );

        }

      }
    );


  /* =========================================================
     RESET LOCAL DATA
  ========================================================= */

  document
    .getElementById(
      'resetLocalBtn'
    )
    .addEventListener(
      'click',
      () => {

        if (
          !confirm(
            'Reset your local quiz progress, bookmarks and mistakes?'
          )
        ) {

          return;

        }


        localStorage.removeItem(
          userKey
        );


        state = {

          ...defaults,

          name:
            telegramUser

              ? [
                  telegramUser.first_name,
                  telegramUser.last_name
                ]
                .filter(Boolean)
                .join(' ')

              : 'Guest'

        };


        /*
          IMPORTANT:
          Reset does not change the theme.
          The user's appearance preference remains.
        */

        syncDaily();

        saveState();

        renderHeader();

        renderProfile();

        applyTheme();


        toast(
          'Local quiz data reset'
        );

      }
    );


  /* =========================================================
     INITIALIZATION
  ========================================================= */

  /*
    Apply theme immediately.
    This prevents a dark/light flash.
  */

  applyTheme();


  syncDaily();

  renderHeader();


  document
    .getElementById(
      'recitationControls'
    )
    .classList.remove(
      'hidden'
    );


  document
    .getElementById(
      'audioBtn'
    )
    .classList.toggle(
      'locked-control',
      !state.isPro
    );


  document
    .getElementById(
      'speedSelect'
    )
    .disabled =
    !state.isPro;


  /*
    Restore theme from Telegram CloudStorage.
    This is intentionally NOT followed by ".then()".
  */

  loadCloudTheme();


  /*
    Authenticate with the backend.
  */

  authenticate();


  /*
    Expose only the safe function needed
    by the inline Retry button.
  */

  window.startQuiz =
    startQuiz;

})();