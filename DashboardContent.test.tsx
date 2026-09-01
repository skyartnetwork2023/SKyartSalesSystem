import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import DashboardContent from '../DashboardContent';
import { vi } from 'vitest';

// Mock the auth context so useAuth() returns a null user (unauthenticated)
vi.mock('../../contexts/AuthContext', () => ({
  useAuth: () => ({ user: null, loading: false }),
}));

// Mock getVouchers to avoid network calls
vi.mock('../../lib/voucherService', () => ({
  getVouchers: async () => [],
}));

describe('DashboardContent', () => {
  test('renders charts from localStorage data and shows plan name', async () => {
    const year = new Date().getFullYear();
    const key = `vouchers:${year}`;

    const sample = [
      {
        dataPlan: 'Plan A',
        unitPrice: 1000,
        months: { JAN: 1, FEB: 2 },
      },
    ];

    localStorage.setItem(key, JSON.stringify(sample));

    render(<DashboardContent />);

    // heading should be present
    expect(screen.getByText(/Total Amount by Data Plan/i)).toBeInTheDocument();

    // Wait for legend/label showing plan name to appear
    await waitFor(() => {
      expect(screen.getByText(/Plan A/i)).toBeInTheDocument();
    });

    // X-axis month label should appear
    await waitFor(() => {
      expect(screen.getByText(/JAN/i)).toBeInTheDocument();
    });
  });
});
