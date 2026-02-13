import { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useStore } from '../store/useStore';
import GoogleLoginButton from './GoogleLoginButton';
import { Map, ClipboardList, Plane, LogOut } from 'lucide-react';

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
    { path: '/', label: '홈', icon: Map },
    { path: '/my', label: '내 여행', icon: ClipboardList },
    { path: '/plan/new', label: '여행 만들기', icon: Plane },
  ];

  const isActive = (path: string) => location.pathname === path;

  return (
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
                <li><a onClick={() => navigate('/my')} className="flex items-center gap-2"><ClipboardList className="w-4 h-4" /> 내 여행</a></li>
                <li><a onClick={() => navigate('/plan/new')} className="flex items-center gap-2"><Plane className="w-4 h-4" /> 새 여행</a></li>
                <li><a onClick={handleLogout} className="flex items-center gap-2"><LogOut className="w-4 h-4" /> 로그아웃</a></li>
              </ul>
            </div>
          ) : (
            <GoogleLoginButton />
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
            aria-label="메뉴"
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
                  <a 
                    onClick={handleLogout} 
                    className="flex items-center gap-3 py-3 text-error"
                  >
                    <LogOut className="w-5 h-5" />
                    <span className="font-medium">로그아웃</span>
                  </a>
                </li>
              </>
            ) : (
              <li className="px-2 py-2">
                <GoogleLoginButton />
              </li>
            )}
          </ul>
        </div>
      )}
    </nav>
  );
}
