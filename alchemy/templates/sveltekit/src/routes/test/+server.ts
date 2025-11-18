import type { RequestHandler } from "@sveltejs/kit";

export const GET: RequestHandler = async ({ request, platform }) => {
	const { searchParams } = new URL(request.url);
	const name = searchParams.get("name");
	return Response.json({ name, env: platform?.env });
};
