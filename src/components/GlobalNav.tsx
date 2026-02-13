import { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useStore } from '../store/useStore';
import GoogleLoginButton from './GoogleLoginButton';

export function GlobalNav() {
  const navigate = useNavigate();
  const location = useLocation();
  const { currentUser, setCurrentUser } = useStore();
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  const handleLogout = () => {
    setCurrentUser(null);
    localStorage.removeItem('temp_user_id');
    setIsMenuOpen(false);
  };

  const navItems = [
    { path: '/', label: '홈', icon: '🗺️' },
    { path: '/my', label: '내 여행', icon: '📋' },
    { path: '/plan/new', label: '여행 만들기', icon: '✈️' },
  ];

  const isActive = (path: string) => location.pathname === path;

  return (
    <nav className="navbar bg-base-100 shadow-lg sticky top-0 z-50">
      <div className="container mx-auto">
        {/* Logo */}
        <div className="flex-1">
          <a 
            className="btn btn-ghost text-xl gap-2 px-2" 
            onClick={() => navigate('/')}
          >
            <img src="/favicon-512x512.png" alt="Travly" className="w-8 h-8" />
            <span className="hidden sm:inline font-bold">Travly</span>
          </a>
        </div>

        {/* Desktop Navigation */}
        <div className="hidden md:flex flex-none gap-2">
          {navItems.map((item) => (
            <button
              key={item.path}
              className={`btn btn-ghost btn-sm ${isActive(item.path) ? 'btn-active' : ''}`}
              onClick={() => navigate(item.path)}
            >
              <span className="mr-1">{item.icon}</span>
              {item.label}
            </button>
          ))}
          
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
                <li><a onClick={() => navigate('/my')}>📋 내 여행</a></li>
                <li><a onClick={() => navigate('/plan/new')}>✈️ 새 여행</a></li>
                <li><a onClick={handleLogout}>🚪 로그아웃</a></li>
              </ul>
            </div>
          ) : (
            <GoogleLoginButton />
          )}
        </div>

        {/* Mobile Menu Button */}
        <div className="flex-none md:hidden">
          <button 
            className="btn btn-square btn-ghost"
            onClick={() => setIsMenuOpen(!isMenuOpen)}
          >
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" className="inline-block w-5 h-5 stroke-current">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6h16M4 12h16M4 18h16"></path>
            </svg>
          </button>
        </div>
      </div>

      {/* Mobile Menu Dropdown */}
      {isMenuOpen && (
        <div className="md:hidden absolute top-full left-0 right-0 bg-base-100 shadow-lg border-t">
          <ul className="menu menu-compact p-2">
            {navItems.map((item) => (
              <li key={item.path}>
                <a
                  className={isActive(item.path) ? 'active' : ''}
                  onClick={() => {
                    navigate(item.path);
                    setIsMenuOpen(false);
                  }}
                >
                  <span>{item.icon}</span>
                  {item.label}
                </a>
              </li>
            ))}
            {currentUser ? (
              <>
                <li className="menu-title mt-2">
                  <span className="flex items-center gap-2">
                    {currentUser.picture && (
                      <img src={currentUser.picture} className="w-6 h-6 rounded-full" alt="" />
                    )}
                    {currentUser.username}
                  </span>
                </li>
                <li><a onClick={handleLogout}>🚪 로그아웃</a></li>
              </>
            ) : (
              <li className="mt-2 px-2">
                <GoogleLoginButton />
              </li>
            )}
          </ul>
        </div>
      )}
    </nav>
  );
}
