// Centralized Icons component using Lucide React
// Replaces emoji icons for professional UI

import {
  Map,
  ClipboardList,
  Plane,
  MapPin,
  Calendar,
  Sun,
  Sunrise,
  Sunset,
  Moon,
  Globe,
  LogOut,
  Flag,
  Trophy,
  User,
  Clock,
  Cloud,
  ChevronLeft,
  MessageCircle,
  Settings,
  Plus,
  Search,
  X,
  Check,
  Star,
  AlertCircle,
  Info,
  ChevronDown,
  ChevronUp,
  Navigation,
  Home,
  Bookmark,
  Heart,
  Share2,
  MoreHorizontal,
  Trash2,
  Edit3,
  Eye,
} from 'lucide-react';

// Common icon sizes
export const ICON_SIZES = {
  xs: 'w-3 h-3',
  sm: 'w-4 h-4',
  md: 'w-5 h-5',
  lg: 'w-6 h-6',
  xl: 'w-8 h-8',
} as const;

type IconSize = keyof typeof ICON_SIZES;

interface IconProps {
  size?: IconSize;
  className?: string;
}

// Navigation Icons
export const HomeIcon = ({ size = 'md', className = '' }: IconProps) => (
  <Map className={`${ICON_SIZES[size]} ${className}`} />
);

export const MyTripsIcon = ({ size = 'md', className = '' }: IconProps) => (
  <ClipboardList className={`${ICON_SIZES[size]} ${className}`} />
);

export const CreateTripIcon = ({ size = 'md', className = '' }: IconProps) => (
  <Plane className={`${ICON_SIZES[size]} ${className}`} />
);

export const LogoutIcon = ({ size = 'md', className = '' }: IconProps) => (
  <LogOut className={`${ICON_SIZES[size]} ${className}`} />
);

// Location Icons
export const LocationIcon = ({ size = 'md', className = '' }: IconProps) => (
  <MapPin className={`${ICON_SIZES[size]} ${className}`} />
);

export const GlobeIcon = ({ size = 'md', className = '' }: IconProps) => (
  <Globe className={`${ICON_SIZES[size]} ${className}`} />
);

export const NavigationIcon = ({ size = 'md', className = '' }: IconProps) => (
  <Navigation className={`${ICON_SIZES[size]} ${className}`} />
);

// Time Icons
export const CalendarIcon = ({ size = 'md', className = '' }: IconProps) => (
  <Calendar className={`${ICON_SIZES[size]} ${className}`} />
);

export const ClockIcon = ({ size = 'md', className = '' }: IconProps) => (
  <Clock className={`${ICON_SIZES[size]} ${className}`} />
);

// Time of Day Icons
export const MorningIcon = ({ size = 'md', className = '' }: IconProps) => (
  <Sunrise className={`${ICON_SIZES[size]} ${className}`} />
);

export const AfternoonIcon = ({ size = 'md', className = '' }: IconProps) => (
  <Sun className={`${ICON_SIZES[size]} ${className}`} />
);

export const EveningIcon = ({ size = 'md', className = '' }: IconProps) => (
  <Sunset className={`${ICON_SIZES[size]} ${className}`} />
);

export const NightIcon = ({ size = 'md', className = '' }: IconProps) => (
  <Moon className={`${ICON_SIZES[size]} ${className}`} />
);

// Weather Icons
export const WeatherIcon = ({ size = 'md', className = '' }: IconProps) => (
  <Cloud className={`${ICON_SIZES[size]} ${className}`} />
);

// Progress Icons
export const FlagIcon = ({ size = 'md', className = '' }: IconProps) => (
  <Flag className={`${ICON_SIZES[size]} ${className}`} />
);

export const TrophyIcon = ({ size = 'md', className = '' }: IconProps) => (
  <Trophy className={`${ICON_SIZES[size]} ${className}`} />
);

// Action Icons
export const BackIcon = ({ size = 'md', className = '' }: IconProps) => (
  <ChevronLeft className={`${ICON_SIZES[size]} ${className}`} />
);

export const ChatIcon = ({ size = 'md', className = '' }: IconProps) => (
  <MessageCircle className={`${ICON_SIZES[size]} ${className}`} />
);

export const SettingsIcon = ({ size = 'md', className = '' }: IconProps) => (
  <Settings className={`${ICON_SIZES[size]} ${className}`} />
);

export const AddIcon = ({ size = 'md', className = '' }: IconProps) => (
  <Plus className={`${ICON_SIZES[size]} ${className}`} />
);

export const SearchIcon = ({ size = 'md', className = '' }: IconProps) => (
  <Search className={`${ICON_SIZES[size]} ${className}`} />
);

export const CloseIcon = ({ size = 'md', className = '' }: IconProps) => (
  <X className={`${ICON_SIZES[size]} ${className}`} />
);

export const CheckIcon = ({ size = 'md', className = '' }: IconProps) => (
  <Check className={`${ICON_SIZES[size]} ${className}`} />
);

export const StarIcon = ({ size = 'md', className = '' }: IconProps) => (
  <Star className={`${ICON_SIZES[size]} ${className}`} />
);

export const AlertIcon = ({ size = 'md', className = '' }: IconProps) => (
  <AlertCircle className={`${ICON_SIZES[size]} ${className}`} />
);

export const InfoIcon = ({ size = 'md', className = '' }: IconProps) => (
  <Info className={`${ICON_SIZES[size]} ${className}`} />
);

export const ExpandIcon = ({ size = 'md', className = '' }: IconProps) => (
  <ChevronDown className={`${ICON_SIZES[size]} ${className}`} />
);

export const CollapseIcon = ({ size = 'md', className = '' }: IconProps) => (
  <ChevronUp className={`${ICON_SIZES[size]} ${className}`} />
);

export const UserIcon = ({ size = 'md', className = '' }: IconProps) => (
  <User className={`${ICON_SIZES[size]} ${className}`} />
);

export const BookmarkIcon = ({ size = 'md', className = '' }: IconProps) => (
  <Bookmark className={`${ICON_SIZES[size]} ${className}`} />
);

export const HeartIcon = ({ size = 'md', className = '' }: IconProps) => (
  <Heart className={`${ICON_SIZES[size]} ${className}`} />
);

export const ShareIcon = ({ size = 'md', className = '' }: IconProps) => (
  <Share2 className={`${ICON_SIZES[size]} ${className}`} />
);

export const MoreIcon = ({ size = 'md', className = '' }: IconProps) => (
  <MoreHorizontal className={`${ICON_SIZES[size]} ${className}`} />
);

export const DeleteIcon = ({ size = 'md', className = '' }: IconProps) => (
  <Trash2 className={`${ICON_SIZES[size]} ${className}`} />
);

export const EditIcon = ({ size = 'md', className = '' }: IconProps) => (
  <Edit3 className={`${ICON_SIZES[size]} ${className}`} />
);

export const ViewIcon = ({ size = 'md', className = '' }: IconProps) => (
  <Eye className={`${ICON_SIZES[size]} ${className}`} />
);

// Re-export raw lucide icons for custom use
export {
  Map,
  ClipboardList,
  Plane,
  MapPin,
  Calendar,
  Sun,
  Sunrise,
  Sunset,
  Moon,
  Globe,
  LogOut,
  Flag,
  Trophy,
  User,
  Clock,
  Cloud,
  ChevronLeft,
  MessageCircle,
  Settings,
  Plus,
  Search,
  X,
  Check,
  Star,
  AlertCircle,
  Info,
  ChevronDown,
  ChevronUp,
  Navigation,
  Home,
  Bookmark,
  Heart,
  Share2,
  MoreHorizontal,
  Trash2,
  Edit3,
  Eye,
};
