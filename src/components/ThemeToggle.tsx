import { Sun, Moon, Monitor } from 'lucide-react';
import { useTheme } from '@/contexts/ThemeContext';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

const ThemeToggle = ({ className = '' }: { className?: string }) => {
  const { theme, setTheme, resolvedTheme } = useTheme();

  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <button
          className={`p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-full transition-colors ${className}`}
          aria-label="Toggle theme"
        >
          {resolvedTheme === 'dark' ? (
            <Moon className="w-[20px] h-[20px] text-gray-700 dark:text-zinc-300 dark:text-gray-300" strokeWidth={1.5} />
          ) : (
            <Sun className="w-[20px] h-[20px] text-gray-700 dark:text-zinc-300 dark:text-gray-300" strokeWidth={1.5} />
          )}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-36 bg-white dark:bg-zinc-900 dark:bg-gray-900 border-gray-200 dark:border-zinc-800 dark:border-gray-700">
        <DropdownMenuItem
          onClick={() => setTheme('light')}
          className={`cursor-pointer ${theme === 'light' ? 'bg-gray-100 dark:bg-gray-800' : ''}`}
        >
          <Sun className="mr-2 h-4 w-4" />
          Light
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => setTheme('dark')}
          className={`cursor-pointer ${theme === 'dark' ? 'bg-gray-100 dark:bg-gray-800' : ''}`}
        >
          <Moon className="mr-2 h-4 w-4" />
          Dark
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => setTheme('system')}
          className={`cursor-pointer ${theme === 'system' ? 'bg-gray-100 dark:bg-gray-800' : ''}`}
        >
          <Monitor className="mr-2 h-4 w-4" />
          System
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

export default ThemeToggle;
