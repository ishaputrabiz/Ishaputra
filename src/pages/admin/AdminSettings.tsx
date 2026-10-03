import React, { useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { Spinner } from '@/components/ui/spinner';
import { AdminPageHeader } from '@/components/admin/AdminPageHeader';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '@/config/firebase';

const AdminSettings = () => {
  const { userProfile, updateUserProfile } = useAuth();
  const { toast } = useToast();
  const [saving, setSaving] = useState(false);
  const [username, setUsername] = useState(userProfile?.username || '');
  const [phone, setPhone] = useState(userProfile?.phone || '');
  const [whatsappNumber, setWhatsappNumber] = useState(userProfile?.whatsappNumber || '');

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim()) {
      toast({ title: 'Add your name', variant: 'destructive' });
      return;
    }
    setSaving(true);
    try {
      const trimmedWhatsapp = whatsappNumber.trim();
      await updateUserProfile({ username: username.trim(), phone: phone.trim(), whatsappNumber: trimmedWhatsapp });
      // Also persist to siteSettings so order notifications use this number
      await setDoc(
        doc(db, 'siteSettings', 'adminNotification'),
        { whatsappNumber: trimmedWhatsapp, updatedAt: serverTimestamp() },
        { merge: true }
      );
      toast({ title: 'Settings saved' });
    } catch {
      toast({ title: 'Could not save settings', description: 'Please try again.', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mx-auto max-w-6xl [&>*]:max-w-4xl">
      <AdminPageHeader title="Settings" description="Your admin profile and the WhatsApp number that gets order alerts." />

      <form onSubmit={handleSave} className="max-w-2xl">
        <Card>
          <CardHeader>
            <h2 className="text-base font-semibold text-foreground leading-tight tracking-tight">Profile</h2>
          </CardHeader>
          <CardContent className="space-y-5">
            <div>
              <Label htmlFor="st-email" className="text-foreground/80">Email</Label>
              <Input id="st-email" type="email" value={userProfile?.email || ''} disabled className="mt-2" />
            </div>
            <div>
              <Label htmlFor="st-name" className="text-foreground/80">Display name</Label>
              <Input id="st-name" autoComplete="name" value={username} onChange={(e) => setUsername(e.target.value)} placeholder="Your name" className="mt-2" required />
            </div>
            <div>
              <Label htmlFor="st-phone" className="text-foreground/80">Phone</Label>
              <Input id="st-phone" type="tel" inputMode="tel" autoComplete="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Phone number" className="mt-2" />
            </div>
            <div>
              <Label htmlFor="st-whatsapp" className="text-foreground/80">WhatsApp number</Label>
              <Input id="st-whatsapp" type="tel" inputMode="tel" aria-describedby="st-whatsapp-hint" value={whatsappNumber} onChange={(e) => setWhatsappNumber(e.target.value)} placeholder="WhatsApp number" className="mt-2" />
              <p id="st-whatsapp-hint" className="mt-1.5 text-xs text-muted-foreground">New order alerts are sent to this number.</p>
            </div>
            <div className="flex justify-end border-t border-border pt-4">
              <Button type="submit" disabled={saving}>
                {saving && <Spinner />}
                {saving ? 'Saving' : 'Save changes'}
              </Button>
            </div>
          </CardContent>
        </Card>
      </form>
    </div>
  );
};

export default AdminSettings;
