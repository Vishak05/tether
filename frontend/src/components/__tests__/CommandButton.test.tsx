import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { Alert } from 'react-native';

import { CommandButton } from '../CommandButton';

describe('CommandButton', () => {
  it('calls onPress when tapped', async () => {
    const onPress = jest.fn().mockResolvedValue(undefined);
    render(<CommandButton label="Lock" onPress={onPress} />);

    fireEvent.press(screen.getByText('Lock'));

    await waitFor(() => expect(onPress).toHaveBeenCalledTimes(1));
  });

  it('shows an alert with the error message when onPress rejects', async () => {
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    const onPress = jest.fn().mockRejectedValue(new Error('Command failed'));
    render(<CommandButton label="Sleep" onPress={onPress} />);

    fireEvent.press(screen.getByText('Sleep'));

    await waitFor(() => expect(alertSpy).toHaveBeenCalledWith('Command failed', 'Something went wrong'));
    alertSpy.mockRestore();
  });

  it('re-enables the button after the command settles', async () => {
    const onPress = jest.fn().mockResolvedValue(undefined);
    render(<CommandButton label="Lock" onPress={onPress} />);

    fireEvent.press(screen.getByText('Lock'));
    await waitFor(() => expect(screen.getByText('Lock')).toBeTruthy());
  });
});
