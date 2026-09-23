import React, { useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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
      toast({ title: 'Validation Error', description: 'Name is required', variant: 'destructive' });
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
      toast({ title: 'Success', description: 'Settings updated successfully' });
    } catch {
      toast({ title: 'Error', description: 'Failed to update settings', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-xl sm:text-2xl font-bold text-gray-900">Settings</h1>
        <p className="text-gray-600 mt-1 text-sm">Manage your account settings</p>
      </div>

      <form onSubmit={handleSave}>
        <Card className="bg-white border-gray-200">
          <CardHeader>
            <CardTitle className="text-gray-900">Profile</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label className="text-gray-700">Email</Label>
              <Input value={userProfile?.email || ''} disabled className="mt-2 bg-gray-50 border-gray-300 text-gray-500" />
            </div>
            <div>
              <Label className="text-gray-700">Display Name</Label>
              <Input value={username} onChange={(e) => setUsername(e.target.value)} placeholder="Enter your name" className="mt-2 bg-gray-100 border-gray-300 text-gray-900" required />
            </div>
            <div>
              <Label className="text-gray-700">Phone</Label>
              <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Phone number" className="mt-2 bg-gray-100 border-gray-300 text-gray-900" />
            </div>
            <div>
              <Label className="text-gray-700">WhatsApp Number</Label>
              <Input value={whatsappNumber} onChange={(e) => setWhatsappNumber(e.target.value)} placeholder="WhatsApp number" className="mt-2 bg-gray-100 border-gray-300 text-gray-900" />
            </div>
            <Button type="submit" className="bg-amber-600 hover:bg-amber-700 text-white" disabled={saving}>
              {saving ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Saving...
                </>
              ) : 'Save Changes'}
            </Button>
          </CardContent>
        </Card>
      </form>
    </div>
  );
};

export default AdminSettings;
