'use client';

import { useEffect, useState } from 'react';

/** The browser's time zone, so nobody has to pick one. */
export function TimezoneInput() {
  const [zone, setZone] = useState('');
  useEffect(() => setZone(Intl.DateTimeFormat().resolvedOptions().timeZone), []);
  return <input type="hidden" name="timezone" value={zone} />;
}
