import React, { useState, useEffect, useRef } from 'react';
import { createClient } from '@supabase/supabase-js';
import { Mic, Upload, Play, Pause, Search, Plus, Calendar, Clock, Trash2, Settings, LogOut } from 'lucide-react';

const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY
);

function App() {
  const [user, setUser] = useState(null);
  const [authMode, setAuthMode] = useState('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [authError, setAuthError] = useState('');
  const [authLoading, setAuthLoading] = useState(false);
  
  const [view, setView] = useState('dashboard');
  const [isRecording, setIsRecording] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState(null);
  const [speed, setSpeed] = useState(1);
  const [entries, setEntries] = useState([]);
  const [prompt, setPrompt] = useState('What made you smile today?');
  const [storage, setStorage] = useState(0);
  const [loading, setLoading] = useState(false);
  
  const [recorder, setRecorder] = useState(null);
  const [time, setTime] = useState(0);
  const interval = useRef(null);
  const audio = useRef(null);
  
  const [newEntry, setNewEntry] = useState({
    title: '',
    tags: '',
    file: null,
    blob: null
  });

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });

    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (user) {
      loadData();
    }
  }, [user]);

  const loadData = async () => {
    try {
      const { data: entriesData } = await supabase
        .from('entries')
        .select('*')
        .order('date', { ascending: false });
      
      setEntries(entriesData || []);

      const { data: promptData } = await supabase
        .from('prompts')
        .select('prompt_text')
        .limit(1);
      
      if (promptData && promptData[0]) {
        setPrompt(promptData[0].prompt_text);
      }

      const { data: profileData } = await supabase
        .from('profiles')
        .select('storage_used')
        .eq('id', user.id)
        .single();
      
      if (profileData) {
        setStorage(profileData.storage_used || 0);
      }
    } catch (error) {
      console.error('Error loading data:', error);
    }
  };

  const handleAuth = async (e) => {
    e.preventDefault();
    setAuthError('');
    setAuthLoading(true);
    
    try {
      if (authMode === 'login') {
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password
        });
        if (error) throw error;
      } else {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: { name }
          }
        });
        if (error) throw error;
        alert('Check your email to confirm your account!');
        setAuthMode('login');
      }
    } catch (error) {
      setAuthError(error.message);
    } finally {
      setAuthLoading(false);
    }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    setEntries([]);
  };

  const startRec = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const rec = new MediaRecorder(stream);
      const chunks = [];
      
      rec.ondataavailable = (e) => chunks.push(e.data);
      rec.onstop = () => {
        setNewEntry({ ...newEntry, blob: new Blob(chunks, { type: 'audio/webm' }) });
        stream.getTracks().forEach(t => t.stop());
      };
      
      rec.start();
      setRecorder(rec);
      setIsRecording(true);
      setTime(0);
      interval.current = setInterval(() => setTime(t => t + 1), 1000);
    } catch (error) {
      alert('Microphone access denied');
    }
  };

  const stopRec = () => {
    if (recorder) {
      recorder.stop();
      setIsRecording(false);
      clearInterval(interval.current);
    }
  };

  const save = async () => {
    if (!newEntry.title || (!newEntry.file && !newEntry.blob)) {
      return alert('Add title and audio');
    }
    
    setLoading(true);
    
    try {
      const f = newEntry.file || newEntry.blob;
      const fn = `${user.id}/${Date.now()}.${newEntry.file ? newEntry.file.name.split('.').pop() : 'webm'}`;
      
      const { error: uploadError } = await supabase.storage
        .from('audio-files')
        .upload(fn, f);
      
      if (uploadError) throw uploadError;

      const { data: urlData } = supabase.storage
        .from('audio-files')
        .getPublicUrl(fn);

      const { error: entryError } = await supabase
        .from('entries')
        .insert({
          user_id: user.id,
          title: newEntry.title,
          audio_url: urlData.publicUrl,
          audio_filename: fn,
          file_size: f.size,
          duration: time
        });
      
      if (entryError) throw entryError;

      setNewEntry({ title: '', tags: '', file: null, blob: null });
      setTime(0);
      setView('dashboard');
      await loadData();
      alert('Saved!');
    } catch (error) {
      alert('Error: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  const del = async (id) => {
    if (!confirm('Delete?')) return;
    
    try {
      const entry = entries.find(x => x.id === id);
      
      await supabase.storage
        .from('audio-files')
        .remove([entry.audio_filename]);
      
      await supabase
        .from('entries')
        .delete()
        .eq('id', id);
      
      await loadData();
      setView('dashboard');
    } catch (error) {
      alert('Error deleting entry');
    }
  };

  const fmt = (s) => `${Math.floor(s/60)}:${(s%60).toString().padStart(2,'0')}`;
  const filtered = entries.filter(e => e.title.toLowerCase().includes(search.toLowerCase()));

  if (!user) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center p-4">
        <div className="bg-white rounded-lg shadow-2xl p-8 max-w-md w-full">
          <h1 className="text-3xl font-bold text-center mb-6">VoiceVault</h1>
          
          <div className="flex gap-2 mb-6">
            <button
              onClick={() => setAuthMode('login')}
              className={`flex-1 py-2 rounded-lg ${authMode === 'login' ? 'bg-purple-600 text-white' : 'bg-gray-100'}`}
            >
              Login
            </button>
            <button
              onClick={() => setAuthMode('signup')}
              className={`flex-1 py-2 rounded-lg ${authMode === 'signup' ? 'bg-purple-600 text-white' : 'bg-gray-100'}`}
            >
              Sign Up
            </button>
          </div>
          
          <form onSubmit={handleAuth} className="space-y-4">
            {authMode === 'signup' && (
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Name"
                className="w-full px-4 py-3 border rounded-lg"
                required
              />
            )}
            
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Email"
              className="w-full px-4 py-3 border rounded-lg"
              required
            />
            
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Password"
              className="w-full px-4 py-3 border rounded-lg"
              required
              minLength={6}
            />
            
            {authError && (
              <div className="bg-red-50 text-red-700 p-3 rounded">{authError}</div>
            )}
            
            <button
              type="submit"
              disabled={authLoading}
              className="w-full py-3 bg-purple-600 text-white rounded-lg"
            >
              {authLoading ? 'Loading...' : authMode === 'login' ? 'Login' : 'Sign Up'}
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <audio ref={audio} onEnded={() => setIsPlaying(false)} />
      
      <header className="bg-white border-b sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-4 py-4 flex justify-between items-center">
          <h1 className="text-xl font-bold">VoiceVault</h1>
          <button onClick={handleLogout} className="p-2">
            <LogOut className="w-5 h-5" />
          </button>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-8">
        {view === 'dashboard' && (
          <div className="space-y-6">
            <div className="bg-gradient-to-r from-purple-500 to-pink-500 rounded-lg p-6 text-white">
              <h3 className="text-sm opacity-90 mb-2">Today's Prompt</h3>
              <p className="text-xl">{prompt}</p>
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div className="bg-white rounded-lg p-4 border">
                <div className="text-2xl font-bold">{entries.length}</div>
                <div className="text-sm text-gray-600">Entries</div>
              </div>
              <div className="bg-white rounded-lg p-4 border">
                <div className="text-2xl font-bold">{(storage/1024/1024).toFixed(1)} MB</div>
                <div className="text-sm text-gray-600">of 1 GB</div>
              </div>
              <div className="bg-white rounded-lg p-4 border">
                <div className="text-2xl font-bold">{Math.round(storage/1024/1024/1024*100)}%</div>
                <div className="text-sm text-gray-600">Used</div>
              </div>
            </div>

            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search..."
                className="w-full pl-10 pr-4 py-3 border rounded-lg"
              />
            </div>

            <div className="space-y-3">
              <h3 className="font-semibold">Recent Entries</h3>
              {filtered.length === 0 ? (
                <p className="text-center py-12 text-gray-500">No entries yet!</p>
              ) : (
                filtered.map(e => (
                  <div
                    key={e.id}
                    onClick={() => {
                      setSelected(e);
                      setView('play');
                    }}
                    className="bg-white rounded-lg p-4 border cursor-pointer hover:shadow"
                  >
                    <div className="flex justify-between">
                      <div className="flex-1">
                        <h4 className="font-medium">{e.title}</h4>
                        <div className="flex gap-4 text-sm text-gray-600 mt-1">
                          <span className="flex items-center gap-1">
                            <Calendar className="w-4 h-4" />
                            {new Date(e.date).toLocaleDateString()}
                          </span>
                          <span className="flex items-center gap-1">
                            <Clock className="w-4 h-4" />
                            {fmt(e.duration||0)}
                          </span>
                        </div>
                      </div>
                      <Play className="w-5 h-5 text-purple-600" />
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {view === 'new' && (
          <div className="space-y-6">
            <div className="flex justify-between">
              <h2 className="text-2xl font-bold">New Entry</h2>
              <button
                onClick={() => {
                  setView('dashboard');
                  setNewEntry({ title: '', tags: '', file: null, blob: null });
                  setTime(0);
                }}
              >
                Cancel
              </button>
            </div>

            <div className="bg-purple-50 border border-purple-200 rounded-lg p-4">
              <span className="font-medium">Prompt: </span>{prompt}
            </div>

            <div className="bg-white rounded-lg p-6 border-2 border-dashed text-center">
              <div className="flex justify-center mb-4">
                {isRecording ? (
                  <div className="w-20 h-20 bg-red-500 rounded-full flex items-center justify-center animate-pulse">
                    <div className="w-6 h-6 bg-white rounded-sm" />
                  </div>
                ) : (
                  <button
                    onClick={startRec}
                    disabled={!!newEntry.file || !!newEntry.blob}
                    className="w-20 h-20 bg-purple-600 rounded-full flex items-center justify-center hover:bg-purple-700 disabled:opacity-50"
                  >
                    <Mic className="w-10 h-10 text-white" />
                  </button>
                )}
              </div>
              <p className="text-gray-600 mb-2">
                {isRecording ? `Recording... ${fmt(time)}` : newEntry.blob ? 'Complete' : 'Click to record'}
              </p>
              {isRecording && (
                <button onClick={stopRec} className="px-4 py-2 bg-red-600 text-white rounded-lg">
                  Stop
                </button>
              )}
            </div>

            <div className="text-center">
              <span className="text-gray-500">or</span>
            </div>

            <div className="bg-white rounded-lg p-6 border-2 border-dashed text-center">
              <label className="cursor-pointer block">
                <input
                  type="file"
                  accept="audio/*"
                  onChange={(e) => setNewEntry({ ...newEntry, file: e.target.files[0] })}
                  disabled={isRecording || !!newEntry.blob}
                  className="hidden"
                />
                <Upload className="w-12 h-12 text-gray-400 mx-auto mb-2" />
                <p>Upload audio</p>
                {newEntry.file && <p className="text-sm text-purple-600 mt-2">{newEntry.file.name}</p>}
              </label>
            </div>

            <input
              value={newEntry.title}
              onChange={(e) => setNewEntry({ ...newEntry, title: e.target.value })}
              placeholder="Title"
              className="w-full px-4 py-3 border rounded-lg"
            />

            <input
              value={newEntry.tags}
              onChange={(e) => setNewEntry({ ...newEntry, tags: e.target.value })}
              placeholder="Tags (comma separated)"
              className="w-full px-4 py-3 border rounded-lg"
            />

            <button
              onClick={save}
              disabled={loading || !newEntry.title || (!newEntry.file && !newEntry.blob)}
              className="w-full py-3 bg-purple-600 text-white rounded-lg disabled:opacity-50"
            >
              {loading ? 'Saving...' : 'Save'}
            </button>
          </div>
        )}

        {view === 'play' && selected && (
          <div className="space-y-6">
            <div className="flex justify-between">
              <button
                onClick={() => {
                  setView('dashboard');
                  setIsPlaying(false);
                  if (audio.current) audio.current.pause();
                }}
                className="text-purple-600"
              >
                ← Back
              </button>
              <button onClick={() => del(selected.id)} className="p-2 text-red-600">
                <Trash2 className="w-5 h-5" />
              </button>
            </div>

            <div>
              <h2 className="text-2xl font-bold mb-2">{selected.title}</h2>
              <div className="flex gap-4 text-sm text-gray-600">
                <span className="flex items-center gap-1">
                  <Calendar className="w-4 h-4" />
                  {new Date(selected.date).toLocaleDateString()}
                </span>
                <span className="flex items-center gap-1">
                  <Clock className="w-4 h-4" />
                  {fmt(selected.duration||0)}
                </span>
              </div>
            </div>

            <div className="bg-white rounded-lg p-6 border">
              <div className="flex items-center justify-between mb-4">
                <button
                  onClick={() => {
                    if (!audio.current) return;
                    if (isPlaying) {
                      audio.current.pause();
                      setIsPlaying(false);
                    } else {
                      audio.current.src = selected.audio_url;
                      audio.current.playbackRate = speed;
                      audio.current.play();
                      setIsPlaying(true);
                    }
                  }}
                  className="w-14 h-14 bg-purple-600 rounded-full flex items-center justify-center"
                >
                  {isPlaying ? (
                    <Pause className="w-6 h-6 text-white" />
                  ) : (
                    <Play className="w-6 h-6 text-white ml-1" />
                  )}
                </button>
                
                <select
                  value={speed}
                  onChange={(e) => {
                    setSpeed(parseFloat(e.target.value));
                    if (audio.current) audio.current.playbackRate = parseFloat(e.target.value);
                  }}
                  className="px-3 py-1 border rounded"
                >
                  <option value="0.5">0.5x</option>
                  <option value="0.75">0.75x</option>
                  <option value="1">1x</option>
                  <option value="1.25">1.25x</option>
                  <option value="1.5">1.5x</option>
                  <option value="2">2x</option>
                </select>
              </div>
            </div>
          </div>
        )}
      </main>

      {view === 'dashboard' && (
        <button
          onClick={() => setView('new')}
          className="fixed bottom-8 right-8 w-16 h-16 bg-purple-600 rounded-full shadow-lg flex items-center justify-center hover:scale-110 transition"
        >
          <Plus className="w-8 h-8 text-white" />
        </button>
      )}
    </div>
  );
}

export default App;