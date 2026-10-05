import { useNavigate } from 'react-router-dom';
import { useSession } from '../../state/session-context';
import { useToast } from '../../state/toast-context';
import { errorMessage } from '../../utils/error-messages';
import { Menu } from '../ui/menu';
import { Avatar } from '../ui/states';
import styles from './user-menu.module.css';

export function UserMenu() {
  const { user, logOut } = useSession();
  const { notify } = useToast();
  const navigate = useNavigate();
  const name = user ? `${user.firstName} ${user.lastName}` : 'Account';

  return (
    <Menu
      label="Account"
      items={[
        { key: 'settings', label: 'Settings', description: user?.email, onSelect: () => navigate('/settings') },
        {
          key: 'logout',
          label: 'Log out',
          onSelect: () =>
            void logOut()
              .then(() => navigate('/login', { replace: true }))
              .catch((error: unknown) => notify(errorMessage(error))),
        },
      ]}
      renderTrigger={({ open, toggle, id, menuId }) => (
        <button
          id={id}
          type="button"
          className={styles.trigger}
          aria-haspopup="menu"
          aria-expanded={open}
          aria-controls={open ? menuId : undefined}
          aria-label={`Account menu for ${name}`}
          onClick={toggle}
        >
          <Avatar name={name} />
        </button>
      )}
    />
  );
}
