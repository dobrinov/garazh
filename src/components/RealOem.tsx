import { api, errorMessage } from "../api";
import { bmwPartNumbers, formatBmwPart, isRealOemMake, realOemPartUrl } from "../lib/realoem";
import { Icon, useToast } from "./ui";

/** A small "RealOEM" button for each BMW part number in the text (BMW / MINI cars only). */
export function RealOemPartLinks({ make, text }: { make: string | null | undefined; text: string | null | undefined }) {
  const toast = useToast();
  if (!isRealOemMake(make)) return null;
  const numbers = bmwPartNumbers(text);
  if (numbers.length === 0) return null;
  return (
    <>
      {numbers.map((n) => (
        <button
          key={n}
          type="button"
          className="btn small ghost realoem-link"
          title={`Отвори ${formatBmwPart(n)} в RealOEM: съвместимост и заместващи номера`}
          aria-label={`Отвори част ${formatBmwPart(n)} в RealOEM`}
          onClick={() => api.openUrl(realOemPartUrl(n)).catch((e) => toast(errorMessage(e), true))}
        >
          <Icon name="link" size={14} />
          RealOEM
        </button>
      ))}
    </>
  );
}
