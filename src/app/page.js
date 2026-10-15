import Link from "next/link";

export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-[#f5efe6] px-6 py-12 text-center">
      <div className="w-full max-w-2xl rounded-2xl border border-[#e5d5c1] bg-white p-8 shadow-lg sm:p-12">
        <div className="mb-6 text-5xl">🏡</div>

        <h1 className="mb-4 text-3xl font-bold text-[#654321] sm:text-5xl">
          GateKeeper Estate
        </h1>

        <p className="mb-6 text-lg font-medium text-[#8b6b4a]">
          Estate Management System
        </p>

        <p className="mx-auto mb-8 max-w-lg leading-7 text-gray-600">
          Welcome to GateKeeper, your centralized platform for managing
          residential estate activities. Access visitor management,
          maintenance complaints, levies, announcements, and estate security
          services in one place.
        </p>

        <Link
          href="/login"
          className="inline-flex items-center justify-center rounded-lg bg-[#79512f] px-8 py-3 font-semibold text-white transition hover:bg-[#5d3c22] focus:outline-none focus:ring-2 focus:ring-[#79512f] focus:ring-offset-2"
        >
          Login to Your Account
        </Link>

        <p className="mt-8 text-sm text-gray-500">
          Secure access for residents, security personnel, and estate
          administrators.
        </p>
      </div>
    </main>
  );
}