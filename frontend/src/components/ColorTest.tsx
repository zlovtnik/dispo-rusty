import React from 'react';

export const ColorTest: React.FC = () => {
  return (
    <div className="min-h-screen bg-natural-light p-8">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-4xl font-bold text-healing-dark mb-8 text-center">
          🌿 Natural Pharmacy Color System
        </h1>

        {/* Quick Visual Test */}
        <div className="mb-8 p-6 bg-white rounded-xl shadow-xl">
          <h2 className="text-2xl font-semibold text-healing-dark mb-4">🧪 Quick Style Test</h2>
          <p className="text-natural-dark mb-4">
            If you can see proper colors and styling below, the Natural Pharmacy theme is working!
          </p>
          <div className="flex gap-4 flex-wrap">
            <button className="btn-primary-pharmacy">Primary Healing</button>
            <button className="btn-secondary-pharmacy">Secondary Warm</button>
            <button className="btn-accent-pharmacy">Accent Wellness</button>
          </div>
        </div>

        {/* Primary Colors - Sage Green */}
        <section className="mb-12">
          <h2 className="text-2xl font-semibold text-healing-dark mb-4">Primary - Sage Green</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-primary-50 p-4 rounded-lg text-primary-950 font-medium">
              50 - Very Light
            </div>
            <div className="bg-primary-100 p-4 rounded-lg text-primary-950 font-medium">
              100 - Light
            </div>
            <div className="bg-primary-300 p-4 rounded-lg text-white font-medium">
              300 - Medium Light
            </div>
            <div className="bg-primary-500 p-4 rounded-lg text-white font-medium">
              500 - Primary
            </div>
            <div className="bg-primary-600 p-4 rounded-lg text-white font-medium">600 - Dark</div>
            <div className="bg-primary-700 p-4 rounded-lg text-white font-medium">700 - Deep</div>
            <div className="bg-primary-800 p-4 rounded-lg text-white font-medium">
              800 - Very Dark
            </div>
            <div className="bg-primary-900 p-4 rounded-lg text-white font-medium">
              900 - Almost Black
            </div>
          </div>
        </section>

        {/* Secondary Colors - Golden Honey */}
        <section className="mb-12">
          <h2 className="text-2xl font-semibold text-healing-dark mb-4">
            Secondary - Golden Honey
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-secondary-50 p-4 rounded-lg text-secondary-950 font-medium">
              50 - Very Light
            </div>
            <div className="bg-secondary-200 p-4 rounded-lg text-secondary-950 font-medium">
              200 - Pale
            </div>
            <div className="bg-secondary-400 p-4 rounded-lg text-white font-medium">
              400 - Medium
            </div>
            <div className="bg-secondary-500 p-4 rounded-lg text-white font-medium">
              500 - Honey
            </div>
            <div className="bg-secondary-600 p-4 rounded-lg text-white font-medium">
              600 - Dark Honey
            </div>
            <div className="bg-secondary-800 p-4 rounded-lg text-white font-medium">
              800 - Browner
            </div>
            <div className="bg-secondary-900 p-4 rounded-lg text-white font-medium">
              900 - Very Dark
            </div>
          </div>
        </section>

        {/* Tertiary Colors - Earth Brown */}
        <section className="mb-12">
          <h2 className="text-2xl font-semibold text-healing-dark mb-4">Tertiary - Earth Brown</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-tertiary-100 p-4 rounded-lg text-tertiary-950 font-medium">
              100 - Light Earth
            </div>
            <div className="bg-tertiary-300 p-4 rounded-lg text-white font-medium">
              300 - Light Medium
            </div>
            <div className="bg-tertiary-500 p-4 rounded-lg text-white font-medium">
              500 - Earth Brown
            </div>
            <div className="bg-tertiary-600 p-4 rounded-lg text-white font-medium">
              600 - Dark Earth
            </div>
            <div className="bg-tertiary-700 p-4 rounded-lg text-white font-medium">
              700 - Deeper
            </div>
            <div className="bg-tertiary-900 p-4 rounded-lg text-white font-medium">
              900 - Almost Black
            </div>
          </div>
        </section>

        {/* Accent Colors - Mint Green */}
        <section className="mb-12">
          <h2 className="text-2xl font-semibold text-healing-dark mb-4">Accent - Mint Green</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-accent-50 p-4 rounded-lg text-accent-950 font-medium">
              50 - Very Light
            </div>
            <div className="bg-accent-200 p-4 rounded-lg text-accent-950 font-medium">
              200 - Pale Mint
            </div>
            <div className="bg-accent-400 p-4 rounded-lg text-white font-medium">
              400 - Medium Mint
            </div>
            <div className="bg-accent-500 p-4 rounded-lg text-white font-medium">
              500 - Mint Green
            </div>
            <div className="bg-accent-700 p-4 rounded-lg text-white font-medium">
              700 - Deeper Mint
            </div>
            <div className="bg-accent-800 p-4 rounded-lg text-white font-medium">
              800 - Very Dark
            </div>
          </div>
        </section>

        {/* Component Examples */}
        <section className="mb-12">
          <h2 className="text-2xl font-semibold text-healing-dark mb-4">Component Examples</h2>
          <div className="space-y-6">
            {/* Buttons */}
            <div>
              <h3 className="text-lg font-medium text-healing-dark mb-3">Buttons</h3>
              <div className="flex flex-wrap gap-4">
                <button className="btn-primary-pharmacy">Primary Button</button>
                <button className="btn-secondary-pharmacy">Secondary Button</button>
                <button className="btn-accent-pharmacy">Accent Button</button>
              </div>
            </div>

            {/* Cards */}
            <div>
              <h3 className="text-lg font-medium text-healing-dark mb-3">Cards</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="card-pharmacy">
                  <div className="card-header-pharmacy">
                    <h4 className="font-semibold text-healing-dark">Patient Dashboard</h4>
                  </div>
                  <div className="card-body-pharmacy">
                    <p className="text-natural-dark">
                      Manage patient information with our natural healing approach.
                    </p>
                  </div>
                  <div className="card-footer-pharmacy">
                    <button className="btn-primary-pharmacy text-sm">View Details</button>
                  </div>
                </div>

                <div className="card-pharmacy">
                  <div className="card-header-pharmacy">
                    <h4 className="font-semibold text-healing-dark">Address Book</h4>
                  </div>
                  <div className="card-body-pharmacy">
                    <p className="text-natural-dark">
                      Comprehensive contact management for healthcare providers.
                    </p>
                  </div>
                  <div className="card-footer-pharmacy">
                    <button className="btn-accent-pharmacy text-sm">Manage Contacts</button>
                  </div>
                </div>
              </div>
            </div>

            {/* Form Elements */}
            <div>
              <h3 className="text-lg font-medium text-healing-dark mb-3">Form Elements</h3>
              <div className="max-w-md">
                <label className="form-label-pharmacy">Patient Name</label>
                <input
                  type="text"
                  className="form-input-pharmacy"
                  placeholder="Enter patient name"
                />

                <label className="form-label-pharmacy">Email Address</label>
                <input
                  type="email"
                  className="form-input-pharmacy"
                  placeholder="patient@example.com"
                />

                <div className="mt-4">
                  <button className="btn-primary-pharmacy mr-3">Save Patient</button>
                  <button className="btn-secondary-pharmacy">Cancel</button>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Background Examples */}
        <section className="mb-12">
          <h2 className="text-2xl font-semibold text-healing-dark mb-4">Background Themes</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="p-6 rounded-lg bg-healing">
              <h3 className="text-healing-dark font-semibold mb-2">Healing Theme</h3>
              <p className="text-healing-dark/80">
                Sage green background representing natural healing and wellness.
              </p>
            </div>

            <div className="p-6 rounded-lg bg-natural">
              <h3 className="text-natural-dark font-semibold mb-2">Natural Theme</h3>
              <p className="text-natural-dark/80">
                Earth brown background representing grounding and stability.
              </p>
            </div>

            <div className="p-6 rounded-lg bg-wellness">
              <h3 className="font-semibold mb-2" style={{ color: 'var(--color-wellness-dark)' }}>
                Wellness Theme
              </h3>
              <p style={{ color: 'var(--color-wellness-dark)' }}>
                Mint green background representing fresh energy and vitality.
              </p>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
};
