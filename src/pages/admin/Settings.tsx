import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Settings as SettingsIcon, Store, Database, Cloud } from 'lucide-react';

const Settings = () => {
  return (
    <div className="space-y-6">
      {/* Premium Page Header */}
      <div className="relative overflow-hidden rounded-2xl border border-amber-200/40 bg-gradient-to-br from-amber-50 via-white to-orange-50/30 p-5 shadow-sm">
        <div className="pointer-events-none absolute -top-12 -right-12 h-40 w-40 rounded-full bg-amber-300/20 blur-3xl" />
        <div className="pointer-events-none absolute bottom-0 left-0 h-px w-full bg-gradient-to-r from-transparent via-amber-400/40 to-transparent" />
        <div className="relative">
          <h1 className="text-2xl font-semibold text-gray-900" style={{ fontFamily: "'Playfair Display', serif" }}>Settings</h1>
          <p className="text-gray-600 mt-1">Configure store, integrations and admin preferences</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Store Settings */}
        <Card className="bg-white border-gray-200">
          <CardHeader>
            <CardTitle className="text-gray-900 flex items-center gap-2">
              <Store className="h-5 w-5 text-amber-600" />
              Store Information
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label className="text-gray-700">Store Name</Label>
              <Input
                defaultValue="Sreerasthu Silvers"
                className="mt-2 bg-gray-100 border-gray-300 text-gray-900"
                readOnly
              />
            </div>
            <div>
              <Label className="text-gray-700">Contact Email</Label>
              <Input
                defaultValue="contact@sreerasthu.com"
                className="mt-2 bg-gray-100 border-gray-300 text-gray-900"
              />
            </div>
            <div>
              <Label className="text-gray-700">Phone</Label>
              <Input
                defaultValue="+91 XXXXX XXXXX"
                className="mt-2 bg-gray-100 border-gray-300 text-gray-900"
              />
            </div>
            <Button className="bg-amber-600 hover:bg-amber-700 mt-4">
              Save Changes
            </Button>
          </CardContent>
        </Card>

        {/* Firebase Config */}
        <Card className="bg-white border-gray-200">
          <CardHeader>
            <CardTitle className="text-gray-900 flex items-center gap-2">
              <Database className="h-5 w-5 text-orange-500" />
              Firebase Configuration
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="flex justify-between py-2 border-b border-gray-200">
              <span className="text-gray-600">Project ID</span>
              <span className="text-gray-900 font-mono">sreerasthusilvers-2d574</span>
            </div>
            <div className="flex justify-between py-2 border-b border-gray-200">
              <span className="text-gray-600">Auth Domain</span>
              <span className="text-gray-900 font-mono text-xs">
                sreerasthusilvers-2d574.firebaseapp.com
              </span>
            </div>
            <div className="flex justify-between py-2 border-b border-gray-200">
              <span className="text-gray-600">Status</span>
              <span className="text-green-600 flex items-center gap-1">
                <span className="w-2 h-2 bg-green-600 rounded-full"></span>
                Connected
              </span>
            </div>
            <p className="text-gray-500 text-xs mt-4">
              Firebase is configured and connected. Authentication and Firestore are
              active.
            </p>
          </CardContent>
        </Card>

        {/* Media Storage */}
        <Card className="bg-white border-gray-200">
          <CardHeader>
            <CardTitle className="text-gray-900 flex items-center gap-2">
              <Cloud className="h-5 w-5 text-blue-500" />
              Media Storage
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <p className="text-gray-600">
              Images are stored on Cloudflare R2. See Storage in the admin menu for live
              free-plan usage and estimates.
            </p>
          </CardContent>
        </Card>

        {/* Admin Account */}
        <Card className="bg-white border-gray-200">
          <CardHeader>
            <CardTitle className="text-gray-900 flex items-center gap-2">
              <SettingsIcon className="h-5 w-5 text-purple-500" />
              Admin Account
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label className="text-gray-700">Admin Email</Label>
              <Input
                type="email"
                placeholder="admin@sreerasthu.com"
                className="mt-2 bg-gray-100 border-gray-300 text-gray-900"
              />
            </div>
            <div>
              <Label className="text-gray-700">Current Password</Label>
              <Input
                type="password"
                placeholder="••••••••"
                className="mt-2 bg-gray-100 border-gray-300 text-gray-900"
              />
            </div>
            <div>
              <Label className="text-gray-700">New Password</Label>
              <Input
                type="password"
                placeholder="••••••••"
                className="mt-2 bg-gray-100 border-gray-300 text-gray-900"
              />
            </div>
            <Button className="bg-amber-600 hover:bg-amber-700 mt-4">
              Update Password
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* Security Note */}
      <Card className="bg-red-50 border-red-200">
        <CardContent className="p-6">
          <h3 className="text-red-600 font-medium mb-2">Security Notice</h3>
          <p className="text-red-600/80 text-sm">
            Admin access is restricted. Make sure to keep your credentials secure and never
            share them with unauthorized personnel. All admin actions are logged.
          </p>
        </CardContent>
      </Card>
    </div>
  );
};

export default Settings;
