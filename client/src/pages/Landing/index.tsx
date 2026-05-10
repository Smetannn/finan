import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import styles from "./Landing.module.css";

function HeroIllustration() {
  return (
    <svg
      className={styles.heroSvg}
      viewBox="0 0 400 320"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
    >
      <defs>
        <linearGradient id="lg-bar1" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#a855f7" stopOpacity="0.95" />
          <stop offset="100%" stopColor="#6366f1" stopOpacity="0.75" />
        </linearGradient>
        <linearGradient id="lg-bar2" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#22d3ee" stopOpacity="0.9" />
          <stop offset="100%" stopColor="#3b82f6" stopOpacity="0.7" />
        </linearGradient>
        <linearGradient id="lg-line" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#c4b5fd" />
          <stop offset="100%" stopColor="#67e8f9" />
        </linearGradient>
      </defs>
      <rect x="32" y="48" width="336" height="224" rx="16" fill="rgba(255,255,255,0.06)" stroke="rgba(255,255,255,0.12)" strokeWidth="1" />
      <text x="52" y="82" fill="rgba(241,245,249,0.5)" fontSize="13" fontFamily="system-ui, sans-serif">
        Динамика
      </text>
      <path
        d="M 52 210 Q 120 120 180 160 T 300 100 T 348 130"
        fill="none"
        stroke="url(#lg-line)"
        strokeWidth="3"
        strokeLinecap="round"
      />
      <circle cx="52" cy="210" r="5" fill="#c4b5fd" />
      <circle cx="348" cy="130" r="5" fill="#67e8f9" />
      <g transform="translate(52, 228)">
        <rect x="0" y="-60" width="36" height="60" rx="6" fill="url(#lg-bar1)" />
        <rect x="52" y="-95" width="36" height="95" rx="6" fill="url(#lg-bar2)" />
        <rect x="104" y="-45" width="36" height="45" rx="6" fill="url(#lg-bar1)" opacity="0.85" />
        <rect x="156" y="-120" width="36" height="120" rx="6" fill="url(#lg-bar2)" opacity="0.9" />
        <rect x="208" y="-75" width="36" height="75" rx="6" fill="url(#lg-bar1)" opacity="0.75" />
        <rect x="260" y="-100" width="36" height="100" rx="6" fill="url(#lg-bar2)" opacity="0.85" />
      </g>
      <ellipse cx="320" cy="72" rx="28" ry="28" fill="rgba(250,204,21,0.25)" />
      <text x="308" y="80" fontSize="22" fontFamily="system-ui, sans-serif">
        ₽
      </text>
    </svg>
  );
}

const SCROLL_SOLID_THRESHOLD = 24;

export default function LandingPage() {
  const [navSolid, setNavSolid] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    function onScroll() {
      setNavSolid(window.scrollY > SCROLL_SOLID_THRESHOLD);
    }
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    if (!menuOpen) {
      return;
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setMenuOpen(false);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [menuOpen]);

  return (
    <div className={styles.page}>
      <header
        className={`${styles.navWrap} ${navSolid ? styles.navSolid : styles.navHero}`}
        role="banner"
      >
        <div className={styles.navInner}>
          <div className={styles.navRow1}>
            <Link to="/" className={styles.logo}>
              Finan
            </Link>
            <button
              type="button"
              className={styles.navBurger}
              aria-label={menuOpen ? "Закрыть меню" : "Открыть меню"}
              aria-expanded={menuOpen}
              onClick={() => setMenuOpen((o) => !o)}
            >
              ☰
            </button>
          </div>
          <nav
            className={`${styles.navLinks} ${menuOpen ? styles.navLinksMobileOpen : ""}`}
            aria-label="Основная навигация"
          >
            <a
              href="#features"
              className={styles.navAnchor}
              onClick={() => setMenuOpen(false)}
            >
              Возможности
            </a>
            <a
              href="#contacts"
              className={styles.navAnchor}
              onClick={() => setMenuOpen(false)}
            >
              Контакты
            </a>
          </nav>
          <div className={styles.navActions}>
            <Link to="/login" className={styles.btnGhost}>
              Войти
            </Link>
            <Link to="/register" className={styles.btnPrimarySm}>
              Зарегистрироваться
            </Link>
          </div>
        </div>
      </header>

      <section className={styles.hero} aria-labelledby="hero-title">
        <div className={styles.heroInner}>
          <div className={styles.heroText}>
            <h1 id="hero-title" className={styles.heroTitle}>
              Управляйте финансами умнее
            </h1>
            <p className={styles.heroSub}>
              Учёт доходов и расходов, планирование бюджета, финансовые цели и совместный бюджет — всё в
              одном месте
            </p>
            <div className={styles.heroCtas}>
              <Link to="/register" className={styles.btnHeroPrimary}>
                Начать бесплатно
              </Link>
              <Link to="/login" className={styles.btnHeroSecondary}>
                Войти
              </Link>
            </div>
          </div>
          <div className={styles.heroArt}>
            <HeroIllustration />
          </div>
        </div>
      </section>

      <section id="features" className={styles.section} aria-labelledby="features-title">
        <h2 id="features-title" className={styles.sectionTitle}>
          Возможности
        </h2>
        <div className={styles.featuresGrid}>
          <article className={styles.featureCard}>
            <div className={styles.featureIcon} aria-hidden>
              💰
            </div>
            <h3>Учёт финансов</h3>
            <p>
              Записывайте доходы и расходы по категориям. ИИ подскажет где можно сэкономить
            </p>
          </article>
          <article className={styles.featureCard}>
            <div className={styles.featureIcon} aria-hidden>
              📊
            </div>
            <h3>Планирование бюджета</h3>
            <p>
              Устанавливайте лимиты по категориям. Система предупредит если лимит близок к исчерпанию
            </p>
          </article>
          <article className={styles.featureCard}>
            <div className={styles.featureIcon} aria-hidden>
              🎯
            </div>
            <h3>Финансовые цели</h3>
            <p>
              Создавайте цели и откладывайте на них. Система рассчитает сколько нужно откладывать в месяц
            </p>
          </article>
          <article className={styles.featureCard}>
            <div className={styles.featureIcon} aria-hidden>
              👥
            </div>
            <h3>Совместный бюджет</h3>
            <p>
              Объединяйтесь с партнёром или группой для совместного управления финансами
            </p>
          </article>
        </div>
      </section>

      <section id="contacts" className={styles.section} aria-labelledby="contacts-title">
        <h2 id="contacts-title" className={styles.sectionTitle}>
          Контакты
        </h2>
        <div className={styles.contactList}>
          <div className={styles.contactRow}>
            <span className={styles.contactLabel}>Email</span>
            <a href="mailto:support@finan.ru">support@finan.ru</a>
          </div>
          <div className={styles.contactRow}>
            <span className={styles.contactLabel}>Telegram</span>
            <a href="https://t.me/finan_support" target="_blank" rel="noopener noreferrer">
              @finan_support
            </a>
          </div>
          <div className={styles.contactRow}>
            <span className={styles.contactLabel}>GitHub</span>
            <a href="https://github.com/finan" target="_blank" rel="noopener noreferrer">
              github.com/finan
            </a>
          </div>
        </div>
      </section>

      <footer className={styles.footer}>© 2026 Finan. Все права защищены.</footer>
    </div>
  );
}
