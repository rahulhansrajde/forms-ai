import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { ApiError } from '../src/services/api-client';
import { createFakeServices } from './support/fake-services';
import { renderApp } from './support/render-app';

describe('login and signup', () => {
  it('redirects anonymous visitors to the login page', async () => {
    const { services } = createFakeServices({ authenticated: false });
    renderApp(services, '/chat');
    expect(await screen.findByPlaceholderText('Enter Your Email')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Login' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /sign up here/ })).toHaveAttribute('href', '/signup');
  });

  it('logs in and lands on New Chat', async () => {
    const { services, spies } = createFakeServices({ authenticated: false });
    renderApp(services, '/login');
    const user = userEvent.setup();
    await user.type(await screen.findByLabelText('Email'), 'ada@example.com');
    await user.type(screen.getByLabelText('Password'), 'Secret123');
    await user.click(screen.getByRole('button', { name: 'Login' }));
    expect(spies.logIn).toHaveBeenCalledWith({ email: 'ada@example.com', password: 'Secret123' });
    expect(await screen.findByRole('heading', { name: 'Start a new chat' })).toBeInTheDocument();
  });

  it('shows server errors without revealing account details', async () => {
    const { services, spies } = createFakeServices({ authenticated: false });
    spies.logIn.mockRejectedValueOnce(new ApiError(401, 'INVALID_CREDENTIALS', 'Email or password is incorrect.'));
    renderApp(services, '/login');
    const user = userEvent.setup();
    await user.type(await screen.findByLabelText('Email'), 'ada@example.com');
    await user.type(screen.getByLabelText('Password'), 'wrong-password1');
    await user.click(screen.getByRole('button', { name: 'Login' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Email or password is incorrect.');
  });

  it('validates matching passwords before signing up', async () => {
    const { services, spies } = createFakeServices({ authenticated: false });
    renderApp(services, '/signup');
    const user = userEvent.setup();
    await user.type(await screen.findByLabelText('First name'), 'Ada');
    await user.type(screen.getByLabelText('Last name'), 'Lovelace');
    await user.type(screen.getByLabelText('Email address'), 'ada@example.com');
    await user.type(screen.getByLabelText('New password'), 'Secret123');
    await user.type(screen.getByLabelText('Re-enter password'), 'Secret124');
    await user.click(screen.getByRole('button', { name: 'Sign up' }));
    expect(await screen.findByText('Passwords do not match.')).toBeInTheDocument();
    expect(spies.signUp).not.toHaveBeenCalled();

    await user.clear(screen.getByLabelText('Re-enter password'));
    await user.type(screen.getByLabelText('Re-enter password'), 'Secret123');
    await user.click(screen.getByRole('button', { name: 'Sign up' }));
    await waitFor(() => expect(spies.signUp).toHaveBeenCalledTimes(1));
    expect(await screen.findByRole('heading', { name: 'Start a new chat' })).toBeInTheDocument();
  });

  it('maps a duplicate email to the email field', async () => {
    const { services, spies } = createFakeServices({ authenticated: false });
    spies.signUp.mockRejectedValueOnce(new ApiError(409, 'EMAIL_ALREADY_REGISTERED', 'An account with this email already exists.'));
    renderApp(services, '/signup');
    const user = userEvent.setup();
    await user.type(await screen.findByLabelText('First name'), 'Ada');
    await user.type(screen.getByLabelText('Last name'), 'Lovelace');
    await user.type(screen.getByLabelText('Email address'), 'ada@example.com');
    await user.type(screen.getByLabelText('New password'), 'Secret123');
    await user.type(screen.getByLabelText('Re-enter password'), 'Secret123');
    await user.click(screen.getByRole('button', { name: 'Sign up' }));
    expect(await screen.findByText('An account with this email already exists.')).toBeInTheDocument();
    expect(screen.getByLabelText('Email address')).toHaveAttribute('aria-invalid', 'true');
  });
});
