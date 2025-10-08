const response = await fetch(
  "https://resend.com/api/domains/da2a8b5e-05bd-4174-b377-7567c9254edc",
  {
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
    },
  },
);

console.log(response);
