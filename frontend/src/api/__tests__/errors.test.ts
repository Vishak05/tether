import { AxiosError } from 'axios';

import { getApiErrorMessage } from '../errors';

function makeAxiosError(data: unknown, status = 400): AxiosError {
  return new AxiosError('Request failed', 'ERR_BAD_REQUEST', undefined, undefined, {
    status,
    statusText: 'Bad Request',
    headers: {},
    config: {} as never,
    data,
  });
}

describe('getApiErrorMessage', () => {
  it('extracts a plain string detail (typical 4xx/500 shape)', () => {
    const err = makeAxiosError({ detail: 'Device not trusted or has been revoked' });
    expect(getApiErrorMessage(err)).toBe('Device not trusted or has been revoked');
  });

  it('joins Pydantic 422 validation error arrays', () => {
    const err = makeAxiosError(
      { detail: [{ loc: ['body', 'level'], msg: 'field required', type: 'missing' }] },
      422,
    );
    expect(getApiErrorMessage(err)).toBe('field required');
  });

  it('falls back to the axios error message when there is no response body', () => {
    const err = new AxiosError('Network Error');
    expect(getApiErrorMessage(err)).toBe('Network Error');
  });

  it('falls back to a generic message for non-axios errors', () => {
    expect(getApiErrorMessage(new Error('boom'))).toBe('Something went wrong');
    expect(getApiErrorMessage('boom')).toBe('Something went wrong');
  });
});
