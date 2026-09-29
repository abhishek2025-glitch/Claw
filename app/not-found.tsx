import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-6 bg-gray-50 text-center">
      <h2 className="text-2xl font-bold text-gray-900 mb-2">Page Not Found</h2>
      <p className="text-sm text-gray-600 mb-4">The requested resource could not be found.</p>
      <Link
        href="/"
        className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium rounded-lg transition-colors"
      >
        Return to Dashboard
      </Link>
    </div>
  );
}
