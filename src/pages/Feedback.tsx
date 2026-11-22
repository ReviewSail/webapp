import FeedbackGate from './FeedbackGate';

// Keep existing /feedback?request_id= links on the same durable, rating-neutral
// flow as email/SMS links. No second, weaker submission path.
export default function Feedback() {
  return <FeedbackGate />;
}
