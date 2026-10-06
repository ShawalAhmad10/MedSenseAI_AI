import { useEffect, useState } from 'react';
import { useLiveDataRefresh } from '../../hooks/useLiveDataRefresh';
import { motion } from 'framer-motion';
import {
  Bell,
  Camera,
  ChevronRight,
  CreditCard,
  Eye,
  EyeOff,
  Globe,
  Loader2,
  Lock,
  Mail,
  MoreHorizontal,
  Phone,
  Shield,
  Trash2,
  User,
  UserPlus,
  Users,
} from 'lucide-react';
import InviteTeamModal from '../../components/modals/InviteTeamModal';
import UpgradePlanModal from '../../components/modals/UpgradePlanModal';
import { useToast } from '../../hooks/useToast';
import { usePharmacistAuth } from '../../hooks/usePharmacistAuth';
import api from '../../services/api';
import { listStaff, removeStaff, resetStaffPassword, saveStaff, toggleStaffStatus } from '../../services/pharmacistOpsService';

export default function Settings() {
  const { showToast } = useToast();
  const { user } = usePharmacistAuth();
  const [activeTab, setActiveTab] = useState('Profile');
  const [team, setTeam] = useState([]);
  const [isTeamLoading, setIsTeamLoading] = useState(false);
  const [isInviteModalOpen, setIsInviteModalOpen] = useState(false);
  const [editingMember, setEditingMember] = useState(null);
  const [isUpgradeModalOpen, setIsUpgradeModalOpen] = useState(false);

  const [editName, setEditName] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [profileSaving, setProfileSaving] = useState(false);

  const [notifs, setNotifs] = useState({
    newOrders: true,
    lowStock: true,
    orderUpdates: true,
    dailyReport: false,
    promotions: false,
  });

  const [currentPw, setCurrentPw] = useState('');
  const [newPw, setNewPw] = useState('');
  const [confirmPw, setConfirmPw] = useState('');
  const [showCurrentPw, setShowCurrentPw] = useState(false);
  const [showNewPw, setShowNewPw] = useState(false);
  const [showConfirmPw, setShowConfirmPw] = useState(false);
  const [pwSaving, setPwSaving] = useState(false);

  const refreshTeam = async (quiet = false) => {
    if (!quiet) setIsTeamLoading(true);
    try {
      setTeam(await listStaff());
    } finally {
      if (!quiet) setIsTeamLoading(false);
    }
  };

  const loadNotificationPreferences = async () => {
    try {
      const response = await api.get('/notifications/preferences');
      if (response.data?.success && response.data?.data) {
        setNotifs(response.data.data);
      }
    } catch (error) {
      console.error('Failed to load notification preferences:', error);
    }
  };

  const saveNotificationPreferences = async () => {
    try {
      const response = await api.put('/notifications/preferences', notifs);
      if (response.data?.success) {
        showToast({ type: 'success', message: 'Notification preferences saved!' });
      }
    } catch (error) {
      showToast({ type: 'error', message: 'Failed to save notification preferences.' });
    }
  };

  useEffect(() => {
    refreshTeam();
    loadNotificationPreferences();
  }, []);
  useLiveDataRefresh(() => refreshTeam(true));

  useEffect(() => {
    if (user) {
      setEditName(user.fullName || user.full_name || '');
      setEditPhone(user.phone || '');
    }
  }, [user]);

  const profileName = user?.fullName || user?.full_name || 'Pharmacist';
  const profileEmail = user?.email || '';
  const profilePharmacy = 'MedsenseAI Pharm'; // Hardcoded single pharmacy
  const profileInitials = profileName.split(' ').map((part) => part[0]).join('').toUpperCase().slice(0, 2);
  const profilePlan = user?.plan || 'free';
  const profileStatus = user?.status || 'approved';

  const tabs = [
    { name: 'Profile', icon: User },
    { name: 'Team', icon: Users },
    { name: 'Notifications', icon: Bell },
    { name: 'Billing', icon: CreditCard },
    { name: 'Security', icon: Shield },
  ];

  const handleToggleStatus = async (id) => {
    await toggleStaffStatus(id);
    await refreshTeam();
    showToast({ type: 'success', message: 'Member status updated' });
  };

  const handleDeleteMember = async (id) => {
    await removeStaff(id);
    await refreshTeam();
    showToast({ type: 'success', message: 'Team member removed' });
  };

  const handleResetPassword = async (member) => {
    await resetStaffPassword(member.id, `Reset@${new Date().getTime()}`);
    await refreshTeam();
    showToast({ type: 'success', message: `Password reset prepared for ${member.name}` });
  };

  const handleSaveMember = async (payload) => {
    await saveStaff(payload, editingMember?.id ?? null);
    setEditingMember(null);
    await refreshTeam();
    showToast({ type: 'success', message: editingMember ? 'Team member updated' : 'Team member created' });
  };

  const handleProfileSave = async () => {
    setProfileSaving(true);
    try {
      const response = await api.patch('/auth/pharmacist/me', { fullName: editName, phone: editPhone });
      
      if (response.data?.success) {
        const authKey = 'medsense_auth_user';
        const raw = sessionStorage.getItem(authKey) || localStorage.getItem(authKey);
        if (raw) {
          const stored = JSON.parse(raw);
          const updated = { ...stored, ...response.data.data };
          (sessionStorage.getItem(authKey) ? sessionStorage : localStorage).setItem(authKey, JSON.stringify(updated));
        }
        showToast({ type: 'success', message: 'Profile saved successfully!' });
      }
    } catch (error) {
      showToast({ type: 'error', message: error.response?.data?.message || 'Failed to save profile. Please try again.' });
    } finally {
      setProfileSaving(false);
    }
  };

  const handlePasswordSave = async () => {
    if (!currentPw || !newPw || !confirmPw) { showToast({ type: 'error', message: 'Please fill all fields.' }); return; }
    if (newPw.length < 8) { showToast({ type: 'error', message: 'New password must be at least 8 characters.' }); return; }
    if (!/[A-Z]/.test(newPw)) { showToast({ type: 'error', message: 'New password must have at least one uppercase letter.' }); return; }
    if (newPw !== confirmPw) { showToast({ type: 'error', message: 'Passwords do not match.' }); return; }
    setPwSaving(true);
    try {
      const response = await api.patch('/auth/pharmacist/me', { currentPassword: currentPw, newPassword: newPw });
      if (response.data?.success) {
        showToast({ type: 'success', message: 'Password changed successfully!' });
        setCurrentPw('');
        setNewPw('');
        setConfirmPw('');
      }
    } catch (error) {
      showToast({ type: 'error', message: error.response?.data?.message || 'Failed to change password.' });
    } finally {
      setPwSaving(false);
    }
  };

  return (
    <div style={{ padding: '1.5rem', width: '100%', maxWidth: 1200, margin: '0 auto' }}>
      <div style={{ marginBottom: '2rem' }}>
        <h1 style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: '1.8rem', color: 'var(--navy)', marginBottom: 4 }}>Settings</h1>
        <p style={{ fontSize: '0.85rem', color: 'var(--gray-400)', fontWeight: 300 }}>Manage your pharmacy profile, team permissions, and account preferences.</p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '250px 1fr', gap: '2rem', alignItems: 'start' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          {tabs.map((tab) => (
            <motion.button key={tab.name} onClick={() => setActiveTab(tab.name)} whileHover={{ x: 4 }} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.75rem 1rem', borderRadius: 12, border: 'none', cursor: 'pointer', textAlign: 'left', background: activeTab === tab.name ? 'var(--navy)' : 'transparent', color: activeTab === tab.name ? 'white' : 'var(--gray-600)', transition: 'all 0.2s' }}>
              <tab.icon size={18} />
              <span style={{ fontSize: '0.9rem', fontWeight: 600 }}>{tab.name}</span>
              {activeTab === tab.name && <motion.div layoutId="setting-tab" style={{ marginLeft: 'auto' }}><ChevronRight size={16} /></motion.div>}
            </motion.button>
          ))}
        </div>

        <div style={{ background: 'white', borderRadius: 'var(--dash-radius)', border: '1px solid var(--dash-border)', boxShadow: 'var(--dash-shadow)', overflow: 'hidden' }}>
          {activeTab === 'Profile' && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} style={{ padding: '2rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '2rem', marginBottom: '2.5rem' }}>
                <div style={{ position: 'relative' }}>
                  <div style={{ width: 100, height: 100, borderRadius: '50%', background: 'var(--dash-bg)', border: '1px solid var(--dash-border)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '2.5rem', fontWeight: 800, color: 'var(--navy)' }}>{profileInitials}</div>
                  <button style={{ position: 'absolute', bottom: 0, right: 0, width: 32, height: 32, borderRadius: '50%', background: 'white', border: '1px solid var(--dash-border)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', boxShadow: '0 2px 8px rgba(0,0,0,0.1)' }}><Camera size={16} color="var(--blue)" /></button>
                </div>
                <div>
                  <h3 style={{ margin: '0 0 4px 0', fontSize: '1.25rem', fontWeight: 700 }}>{profileName}</h3>
                  <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--gray-400)' }}>{profilePharmacy || 'Pharmacist'}</p>
                  <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.75rem' }}>
                    <span style={{ padding: '2px 8px', borderRadius: 100, background: 'var(--blue-light)', color: 'var(--blue)', fontSize: '0.65rem', fontWeight: 700 }}>{profileStatus === 'approved' ? 'VERIFIED' : profileStatus.toUpperCase()}</span>
                    <span style={{ padding: '2px 8px', borderRadius: 100, background: 'var(--dash-bg)', color: 'var(--gray-600)', fontSize: '0.65rem', fontWeight: 700 }}>{profilePlan.toUpperCase()} PLAN</span>
                  </div>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>
                <div style={{ gridColumn: 'span 2' }}>
                  <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: 'var(--gray-600)', marginBottom: '0.5rem' }}>Pharmacy Name</label>
                  <div style={{ position: 'relative' }}>
                    <Globe size={16} color="var(--gray-400)" style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)' }} />
                    <input 
                      value="MedsenseAI Pharm" 
                      readOnly 
                      style={{ 
                        width: '100%', 
                        padding: '0.7rem 1rem 0.7rem 2.75rem', 
                        borderRadius: 10, 
                        border: '1.5px solid var(--dash-border)', 
                        outline: 'none', 
                        boxSizing: 'border-box',
                        background: '#f8fafc',
                        cursor: 'not-allowed',
                        color: 'var(--gray-600)',
                        fontWeight: 600
                      }} 
                    />
                  </div>
                  <p style={{ margin: '0.4rem 0 0 0', fontSize: '0.7rem', color: 'var(--gray-400)' }}>Single pharmacy setup. Multi-pharmacy support coming soon.</p>
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: 'var(--gray-600)', marginBottom: '0.5rem' }}>Email Address</label>
                  <div style={{ position: 'relative' }}>
                    <Mail size={16} color="var(--gray-400)" style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)' }} />
                    <input value={profileEmail} readOnly style={{ width: '100%', padding: '0.7rem 1rem 0.7rem 2.75rem', borderRadius: 10, border: '1.5px solid var(--dash-border)', outline: 'none', background: '#f8fafc', cursor: 'not-allowed', boxSizing: 'border-box' }} />
                  </div>
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: 'var(--gray-600)', marginBottom: '0.5rem' }}>Phone Number</label>
                  <div style={{ position: 'relative' }}>
                    <Phone size={16} color="var(--gray-400)" style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)' }} />
                    <input value={editPhone} onChange={(e) => setEditPhone(e.target.value)} placeholder="+92 300 0000000" style={{ width: '100%', padding: '0.7rem 1rem 0.7rem 2.75rem', borderRadius: 10, border: '1.5px solid var(--dash-border)', outline: 'none', boxSizing: 'border-box' }} />
                  </div>
                </div>
              </div>

              <div style={{ marginTop: '2rem', display: 'flex', justifyContent: 'flex-end' }}>
                <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }} onClick={handleProfileSave} disabled={profileSaving} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '0.7rem 2rem', borderRadius: 100, border: 'none', background: 'var(--navy)', color: 'white', fontWeight: 600, cursor: profileSaving ? 'not-allowed' : 'pointer', opacity: profileSaving ? 0.7 : 1 }}>
                  {profileSaving ? <><Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} /> Saving...</> : 'Save Changes'}
                </motion.button>
              </div>
            </motion.div>
          )}

          {activeTab === 'Team' && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} style={{ padding: '1.5rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.5rem' }}>
                <div>
                  <h3 style={{ margin: '0 0 4px 0', fontSize: '1.1rem', fontWeight: 700 }}>Team Management</h3>
                  <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--gray-400)' }}>Real CRUD surface for staff, assignment, role, status, and password reset.</p>
                </div>
                <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }} onClick={() => { setEditingMember(null); setIsInviteModalOpen(true); }} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '0.6rem 1.25rem', borderRadius: 100, border: 'none', background: 'var(--navy)', color: 'white', fontSize: '0.85rem', fontWeight: 600, cursor: 'pointer' }}>
                  <UserPlus size={16} /> Add Member
                </motion.button>
              </div>

              <div style={{ border: '1px solid var(--dash-border)', borderRadius: 16, overflow: 'auto', maxHeight: '500px' }}>
                <table style={{ width: '100%', minWidth: '900px', borderCollapse: 'collapse', textAlign: 'left' }}>
                  <thead>
                    <tr style={{ background: 'var(--dash-bg)', borderBottom: '1px solid var(--dash-border)' }}>
                      <th style={{ padding: '1rem', fontSize: '0.75rem', fontWeight: 600, color: 'var(--gray-400)', textTransform: 'uppercase' }}>Member</th>
                      <th style={{ padding: '1rem', fontSize: '0.75rem', fontWeight: 600, color: 'var(--gray-400)', textTransform: 'uppercase' }}>Role</th>
                      <th style={{ padding: '1rem', fontSize: '0.75rem', fontWeight: 600, color: 'var(--gray-400)', textTransform: 'uppercase' }}>Status</th>
                      <th style={{ padding: '1rem', fontSize: '0.75rem', fontWeight: 600, color: 'var(--gray-400)', textTransform: 'uppercase' }}>Joined</th>
                      <th style={{ padding: '1rem', textAlign: 'right' }}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {isTeamLoading ? (
                      <tr><td colSpan={6} style={{ padding: '2rem', textAlign: 'center' }}><Loader2 size={20} style={{ animation: 'spin 1s linear infinite' }} /></td></tr>
                    ) : team.map((member) => (
                      <tr key={member.id} style={{ borderBottom: '1px solid var(--dash-border)' }}>
                        <td style={{ padding: '1rem' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                            <div style={{ width: 32, height: 32, borderRadius: '50%', background: 'var(--dash-bg)', border: '1px solid var(--dash-border)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.75rem', fontWeight: 700 }}>
                              {member?.name ? member.name.split(' ').filter(n => n).map((n) => n[0]?.toUpperCase() || '').join('').slice(0, 2) : '?'}
                            </div>
                            <div>
                              <p style={{ margin: 0, fontSize: '0.85rem', fontWeight: 700 }}>{member?.name || 'N/A'}</p>
                              <p style={{ margin: 0, fontSize: '0.7rem', color: 'var(--gray-400)' }}>{member?.email || 'N/A'}</p>
                              <p style={{ margin: '2px 0 0', fontSize: '0.68rem', color: 'var(--gray-400)' }}>
                                {member?.phone || 'No phone'}
                              </p>
                            </div>
                          </div>
                        </td>
                        <td style={{ padding: '1rem', fontSize: '0.8rem', color: 'var(--gray-600)', textTransform: 'capitalize' }}>{member.type || 'pharmacist'}</td>
                        <td style={{ padding: '1rem' }}>
                          <motion.div onClick={() => handleToggleStatus(member.id)} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '3px 10px', borderRadius: 100, cursor: 'pointer', background: member.status === 'active' ? 'var(--green-light)' : 'var(--red-light)', color: member.status === 'active' ? 'var(--green)' : 'var(--red)' }}>
                            <div style={{ width: 6, height: 6, borderRadius: '50%', background: member.status === 'active' ? 'var(--green)' : 'var(--red)' }} />
                            <span style={{ fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase' }}>{member.status}</span>
                          </motion.div>
                        </td>
                        <td style={{ padding: '1rem', fontSize: '0.8rem', color: 'var(--gray-400)' }}>
                          {member.joined ? new Date(member.joined).toLocaleDateString() : 'N/A'}
                        </td>
                        <td style={{ padding: '1rem', textAlign: 'right' }}>
                          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
                            <button onClick={() => { setEditingMember(member); setIsInviteModalOpen(true); }} style={{ padding: '0.4rem', borderRadius: 8, border: 'none', background: 'transparent', color: 'var(--gray-400)', cursor: 'pointer' }}><MoreHorizontal size={16} /></button>
                            <button onClick={() => handleResetPassword(member)} style={{ padding: '0.4rem 0.7rem', borderRadius: 8, border: '1px solid var(--dash-border)', background: 'white', color: 'var(--navy)', cursor: 'pointer', fontSize: '0.72rem', fontWeight: 700 }}>Reset PW</button>
                            <button onClick={() => handleDeleteMember(member.id)} style={{ padding: '0.4rem', borderRadius: 8, border: 'none', background: 'transparent', color: 'var(--gray-400)', cursor: 'pointer' }}><Trash2 size={16} /></button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </motion.div>
          )}

          {activeTab === 'Notifications' && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} style={{ padding: '2rem' }}>
              <h3 style={{ margin: '0 0 0.5rem', fontSize: '1.1rem', fontWeight: 700 }}>Notification Preferences</h3>
              <p style={{ margin: '0 0 2rem', fontSize: '0.82rem', color: 'var(--gray-400)' }}>Choose what you want to be notified about.</p>
              {[
                { key: 'newOrders', label: 'New Orders', desc: 'Get notified when a new order arrives' },
                { key: 'lowStock', label: 'Low Stock Alerts', desc: 'Alert when inventory falls below threshold' },
                { key: 'orderUpdates', label: 'Order Status Updates', desc: 'Updates on order processing and delivery' },
                { key: 'dailyReport', label: 'Daily Summary', desc: 'Daily sales and activity digest email' },
                { key: 'promotions', label: 'Promotions & News', desc: 'MedSenseAI product updates and offers' },
              ].map(({ key, label, desc }) => (
                <div key={key} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '1rem 0', borderBottom: '1px solid var(--dash-border)' }}>
                  <div>
                    <div style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--navy)' }}>{label}</div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--gray-400)', marginTop: 2 }}>{desc}</div>
                  </div>
                  <label style={{ position: 'relative', width: 48, height: 26, cursor: 'pointer', flexShrink: 0 }}>
                    <input type="checkbox" checked={notifs[key]} onChange={(e) => setNotifs((current) => ({ ...current, [key]: e.target.checked }))} style={{ opacity: 0, width: 0, height: 0 }} />
                    <span style={{ position: 'absolute', inset: 0, background: notifs[key] ? 'var(--navy)' : 'var(--dash-border)', borderRadius: 13, transition: 'background 0.2s' }}>
                      <span style={{ position: 'absolute', width: 20, height: 20, background: 'white', borderRadius: '50%', top: 3, left: notifs[key] ? 25 : 3, transition: 'left 0.2s', boxShadow: '0 1px 4px rgba(0,0,0,0.2)' }} />
                    </span>
                  </label>
                </div>
              ))}
              <div style={{ marginTop: '2rem', display: 'flex', justifyContent: 'flex-end' }}>
                <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }} onClick={saveNotificationPreferences} style={{ padding: '0.7rem 2rem', borderRadius: 100, border: 'none', background: 'var(--navy)', color: 'white', fontWeight: 600, cursor: 'pointer' }}>Save Preferences</motion.button>
              </div>
            </motion.div>
          )}

          {activeTab === 'Security' && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} style={{ padding: '2rem' }}>
              <h3 style={{ margin: '0 0 0.5rem', fontSize: '1.1rem', fontWeight: 700 }}>Change Password</h3>
              <p style={{ margin: '0 0 2rem', fontSize: '0.82rem', color: 'var(--gray-400)' }}>Update your password to keep your account secure.</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem', maxWidth: 460 }}>
                {/* Current Password */}
                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: 'var(--gray-600)', marginBottom: '0.5rem' }}>Current Password</label>
                  <div style={{ position: 'relative' }}>
                    <Lock size={16} color="var(--gray-400)" style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)' }} />
                    <input type={showCurrentPw ? 'text' : 'password'} value={currentPw} onChange={(e) => setCurrentPw(e.target.value)} placeholder="••••••••" style={{ width: '100%', padding: '0.7rem 2.75rem 0.7rem 2.75rem', borderRadius: 10, border: '1.5px solid var(--dash-border)', outline: 'none', boxSizing: 'border-box' }} />
                    <button type="button" onClick={() => setShowCurrentPw(v => !v)} style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--gray-400)' }}>{showCurrentPw ? <EyeOff size={16} /> : <Eye size={16} />}</button>
                  </div>
                </div>
                {/* New Password */}
                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: 'var(--gray-600)', marginBottom: '0.5rem' }}>New Password</label>
                  <div style={{ position: 'relative' }}>
                    <Lock size={16} color="var(--gray-400)" style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)' }} />
                    <input type={showNewPw ? 'text' : 'password'} value={newPw} onChange={(e) => setNewPw(e.target.value)} placeholder="••••••••" style={{ width: '100%', padding: '0.7rem 2.75rem 0.7rem 2.75rem', borderRadius: 10, border: '1.5px solid var(--dash-border)', outline: 'none', boxSizing: 'border-box' }} />
                    <button type="button" onClick={() => setShowNewPw(v => !v)} style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--gray-400)' }}>{showNewPw ? <EyeOff size={16} /> : <Eye size={16} />}</button>
                  </div>
                </div>
                {/* Confirm New Password */}
                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: 'var(--gray-600)', marginBottom: '0.5rem' }}>Confirm New Password</label>
                  <div style={{ position: 'relative' }}>
                    <Lock size={16} color="var(--gray-400)" style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)' }} />
                    <input type={showConfirmPw ? 'text' : 'password'} value={confirmPw} onChange={(e) => setConfirmPw(e.target.value)} placeholder="••••••••" style={{ width: '100%', padding: '0.7rem 2.75rem 0.7rem 2.75rem', borderRadius: 10, border: '1.5px solid var(--dash-border)', outline: 'none', boxSizing: 'border-box' }} />
                    <button type="button" onClick={() => setShowConfirmPw(v => !v)} style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--gray-400)' }}>{showConfirmPw ? <EyeOff size={16} /> : <Eye size={16} />}</button>
                  </div>
                </div>

                <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }} onClick={handlePasswordSave} disabled={pwSaving} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '0.75rem 2rem', borderRadius: 100, border: 'none', background: 'var(--navy)', color: 'white', fontWeight: 600, cursor: pwSaving ? 'not-allowed' : 'pointer', opacity: pwSaving ? 0.7 : 1 }}>
                  {pwSaving ? <><Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} /> Saving...</> : 'Update Password'}
                </motion.button>
              </div>
            </motion.div>
          )}

          {activeTab === 'Billing' && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} style={{ padding: '2rem' }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '2rem' }}>
                <div>
                  <h3 style={{ margin: '0 0 4px 0', fontSize: '1.1rem', fontWeight: 700 }}>Current Plan</h3>
                  <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--gray-400)' }}>You are currently on the <strong>Free Tier</strong>.</p>
                </div>
                <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }} onClick={() => setIsUpgradeModalOpen(true)} style={{ padding: '0.6rem 1.25rem', borderRadius: 100, border: 'none', background: 'var(--blue)', color: 'white', fontSize: '0.85rem', fontWeight: 600, cursor: 'pointer' }}>Upgrade Plan</motion.button>
              </div>

              <div style={{ background: 'var(--dash-bg)', padding: '1.5rem', borderRadius: 16, border: '1px solid var(--dash-border)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1rem' }}>
                  <span style={{ fontSize: '0.85rem', fontWeight: 600 }}>Plan Usage</span>
                  <span style={{ fontSize: '0.85rem', fontWeight: 700 }}>42 / 50 Rx</span>
                </div>
                <div style={{ width: '100%', height: 8, background: 'rgba(0,0,0,0.05)', borderRadius: 100, overflow: 'hidden' }}>
                  <motion.div initial={{ width: 0 }} animate={{ width: '84%' }} style={{ height: '100%', background: 'var(--blue)', borderRadius: 100 }} />
                </div>
                <p style={{ margin: '0.75rem 0 0 0', fontSize: '0.7rem', color: 'var(--gray-400)' }}>Your plan resets in <strong>8 days</strong>. Upgrade to Pro for unlimited prescriptions.</p>
              </div>
            </motion.div>
          )}
        </div>
      </div>

      <InviteTeamModal isOpen={isInviteModalOpen} onClose={() => { setIsInviteModalOpen(false); setEditingMember(null); }} member={editingMember} onSubmit={handleSaveMember} />
      <UpgradePlanModal isOpen={isUpgradeModalOpen} onClose={() => setIsUpgradeModalOpen(false)} />
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
