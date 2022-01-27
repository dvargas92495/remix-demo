import { useLoaderData, LoaderFunction } from "remix";
import { getPosts } from "~/post";

export const loader = async ({ params }: Parameters<LoaderFunction>[0]) => {
  return getPosts().find((p) => p.slug === params.slug);
};

export default function PostSlug() {
  const slug = useLoaderData<Awaited<ReturnType<typeof loader>>>();
  return (
    <div>
      <h1>Some Post: {slug?.title}</h1>
    </div>
  );
}
