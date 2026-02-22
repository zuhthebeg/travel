import { useState, useEffect, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useStore } from '../store/useStore';
import GoogleLoginButton from './GoogleLoginButton';
import GuestLoginButton from './GuestLoginButton';
import { Map, ClipboardList, Plane, LogOut, User, Globe } from 'lucide-react';
import { runSync } from '../lib/offline/syncEngine';
import { SUPPORTED_LANGUAGES } from '../i18n';

export function GlobalNav() {
  const navigate = useNavigate();
  const location = useLocation();
  const { t, i18n } = useTranslation();
  const { currentUser, setCurrentUser } = useStore();
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isOfflineMode, setIsOfflineMode] = useState(() => localStorage.getItem('offline_mode') === 'true');
  const [showOnlinePrompt, setShowOnlinePrompt] = useState(false);

  const currentLang = SUPPORTED_LANGUAGES.find(l => i18n.language?.startsWith(l.code)) || SUPPORTED_LANGUAGES[0];

  // Listen for offline mode changes (from ProfilePage toggle)
  useEffect(() => {
    const handleStorage = (e: StorageEvent) => {
      if (e.key === 'offline_mode') setIsOfflineMode(e.newValue === 'true');
    };
    window.addEventListener('storage', handleStorage);

    // Also poll localStorage (storage event doesn't fire in same tab)
    const interval = setInterval(() => {
      const current = localStorage.getItem('offline_mode') === 'true';
      setIsOfflineMode(prev => prev !== current ? current : prev);
    }, 500);

    return () => {
      window.removeEventListener('storage', handleStorage);
      clearInterval(interval);
    };
  }, []);

  // Detect WiFi/network reconnection while in offline mode
  useEffect(() => {
    if (!isOfflineMode) return;

    const handleOnline = () => {
      setShowOnlinePrompt(true);
    };

    window.addEventListener('online', handleOnline);
    return () => window.removeEventListener('online', handleOnline);
  }, [isOfflineMode]);

  const handleSwitchOnline = useCallback(async () => {
    // Sync pending changes first
    try {
      await runSync();
    } catch (e) {
      console.error('[sync on switch]', e);
    }
    localStorage.setItem('offline_mode', 'false');
    setIsOfflineMode(false);
    setShowOnlinePrompt(false);
    window.location.reload();
  }, []);

  const handleLogout = () => {
    setCurrentUser(null);
    localStorage.removeItem('temp_user_id');
    setIsMenuOpen(false);
  };

  const navItems = [
    { path: '/', label: t('nav.home'), icon: Map },
    { path: '/my', label: t('nav.myTrips'), icon: ClipboardList },
    { path: '/plan/new', label: t('nav.createTrip'), icon: Plane },
  ];

  const isActive = (path: string) => location.pathname === path;

  return (
    <>
    <nav className="navbar bg-base-100 shadow-lg sticky top-0 z-50 min-h-0 px-2 py-1">
      <div className="container mx-auto flex items-center">
        {/* Logo */}
        <div className="flex-1 min-w-0">
          <a 
            className="btn btn-ghost btn-sm text-lg gap-1 px-1 cursor-pointer" 
            onClick={() => navigate('/')}
          >
            <img 
              src="/logo.svg" 
              alt="Travly" 
              className="w-7 h-7" 
            />
            <span className="font-bold text-primary">Travly</span>
          </a>
          {isOfflineMode && (
            <button
              onClick={() => navigate('/profile')}
              className="badge badge-warning badge-sm font-bold gap-1 cursor-pointer hover:badge-outline transition-all ml-1"
              title={t('nav.offlineSettings')}
            >
              ⚡ {t('nav.offline')}
            </button>
          )}
        </div>

        {/* Desktop Navigation */}
        <div className="hidden md:flex flex-none gap-1">
          {navItems.map((item) => {
            const IconComponent = item.icon;
            return (
              <button
                key={item.path}
                className={`btn btn-ghost btn-sm ${isActive(item.path) ? 'btn-active' : ''}`}
                onClick={() => navigate(item.path)}
              >
                <IconComponent className="w-4 h-4" />
                {item.label}
              </button>
            );
          })}
          
          {/* Language selector */}
          <div className="dropdown dropdown-end">
            <div tabIndex={0} role="button" className="btn btn-ghost btn-sm gap-1">
              <Globe className="w-4 h-4" />
              <span className="text-xs">{currentLang.flag}</span>
            </div>
            <ul tabIndex={0} className="menu menu-sm dropdown-content mt-3 z-[1] p-2 shadow bg-base-100 rounded-box w-40">
              {SUPPORTED_LANGUAGES.map((lang) => (
                <li key={lang.code}>
                  <a
                    className={lang.code === currentLang.code ? 'active' : ''}
                    onClick={() => { i18n.changeLanguage(lang.code); (document.activeElement as HTMLElement)?.blur(); }}
                  >
                    {lang.flag} {lang.label}
                  </a>
                </li>
              ))}
            </ul>
          </div>

          {currentUser ? (
            <div className="dropdown dropdown-end">
              <div tabIndex={0} role="button" className="btn btn-ghost btn-circle avatar">
                {currentUser.picture ? (
                  <div className="w-8 rounded-full">
                    <img src={currentUser.picture} alt={currentUser.username} />
                  </div>
                ) : (
                  <div className="avatar placeholder">
                    <div className="bg-neutral text-neutral-content rounded-full w-8">
                      <span className="text-xs">{currentUser.username[0]}</span>
                    </div>
                  </div>
                )}
              </div>
              <ul tabIndex={0} className="menu menu-sm dropdown-content mt-3 z-[1] p-2 shadow bg-base-100 rounded-box w-52">
                <li className="menu-title">
                  <span>{currentUser.username}</span>
                </li>
                <li><a onClick={() => navigate('/profile')} className="flex items-center gap-2"><User className="w-4 h-4" /> {t('nav.myProfile')}</a></li>
                <li><a onClick={() => navigate('/my')} className="flex items-center gap-2"><ClipboardList className="w-4 h-4" /> {t('nav.myTrips')}</a></li>
                <li><a onClick={() => navigate('/plan/new')} className="flex items-center gap-2"><Plane className="w-4 h-4" /> {t('nav.newTrip')}</a></li>
                <li><a onClick={handleLogout} className="flex items-center gap-2"><LogOut className="w-4 h-4" /> {t('nav.logout')}</a></li>
              </ul>
            </div>
          ) : (
            <div className="flex items-center gap-1">
              <GoogleLoginButton />
              <GuestLoginButton />
            </div>
          )}
        </div>

        {/* Mobile Menu Button */}
        <div className="flex-none md:hidden flex items-center gap-1">
          {currentUser && currentUser.picture && (
            <div className="avatar">
              <div className="w-7 rounded-full ring ring-primary ring-offset-base-100 ring-offset-1">
                <img src={currentUser.picture} alt="" />
              </div>
            </div>
          )}
          <button 
            className="btn btn-square btn-ghost btn-sm"
            onClick={() => setIsMenuOpen(!isMenuOpen)}
            aria-label={t('nav.menu')}
          >
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" className="inline-block w-5 h-5 stroke-current">
              {isMenuOpen ? (
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path>
              ) : (
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6h16M4 12h16M4 18h16"></path>
              )}
            </svg>
          </button>
        </div>
      </div>

      {/* Mobile Menu Dropdown */}
      {isMenuOpen && (
        <div className="md:hidden absolute top-full left-0 right-0 bg-base-100 shadow-lg border-t z-50 animate-fade-in">
          <ul className="menu p-2 gap-1">
            {navItems.map((item) => {
              const IconComponent = item.icon;
              return (
                <li key={item.path}>
                  <a
                    className={`flex items-center gap-3 py-3 ${isActive(item.path) ? 'active bg-primary/10 text-primary' : ''}`}
                    onClick={() => {
                      navigate(item.path);
                      setIsMenuOpen(false);
                    }}
                  >
                    <IconComponent className="w-5 h-5" />
                    <span className="font-medium">{item.label}</span>
                  </a>
                </li>
              );
            })}
            <div className="divider my-1"></div>
            {currentUser ? (
              <>
                <li className="menu-title px-3">
                  <span className="text-xs text-base-content/60">{currentUser.username}</span>
                </li>
                <li>
                  <a onClick={() => navigate('/profile')} className="flex items-center gap-3 py-3">
                    <User className="w-5 h-5" />
                    <span className="font-medium">{t('nav.myProfile')}</span>
                  </a>
                </li>
                <li>
                  <a 
                    onClick={handleLogout} 
                    className="flex items-center gap-3 py-3 text-error"
                  >
                    <LogOut className="w-5 h-5" />
                    <span className="font-medium">{t('nav.logout')}</span>
                  </a>
                </li>
              </>
            ) : (
              <li className="px-2 py-2 flex flex-col gap-2">
                <GoogleLoginButton fullWidth />
                <GuestLoginButton fullWidth />
              </li>
            )}
            {/* Mobile language selector */}
            <div className="divider my-1"></div>
            <li>
              <div className="flex items-center gap-2 flex-wrap py-2">
                <Globe className="w-4 h-4 opacity-60" />
                {SUPPORTED_LANGUAGES.map((lang) => (
                  <button
                    key={lang.code}
                    className={`btn btn-xs ${lang.code === currentLang.code ? 'btn-primary' : 'btn-ghost'}`}
                    onClick={() => { i18n.changeLanguage(lang.code); setIsMenuOpen(false); }}
                  >
                    {lang.flag} {lang.label}
                  </button>
                ))}
              </div>
            </li>
          </ul>
        </div>
      )}
    </nav>

    {/* Online reconnection prompt */}
    {showOnlinePrompt && (
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[100] p-4">
        <div className="card bg-base-100 shadow-xl max-w-sm w-full">
          <div className="card-body text-center p-5">
            <p className="text-3xl mb-1">📶</p>
            <h3 className="font-bold text-lg">{t('online.detected')}</h3>
            <p className="text-sm text-base-content/70 mt-1 whitespace-pre-line">
              {t('online.switchPrompt')}
            </p>
            <div className="flex gap-2 mt-4 justify-center">
              <button
                className="btn btn-ghost btn-sm"
                onClick={() => setShowOnlinePrompt(false)}
              >
                {t('online.later')}
              </button>
              <button
                className="btn btn-primary btn-sm"
                onClick={handleSwitchOnline}
              >
                {t('online.switchOnline')}
              </button>
            </div>
          </div>
        </div>
      </div>
    )}
    </>
  );
}
