import { cn } from '../lib/utils';

interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
  className?: string;
  bordered?: boolean;
  imageFull?: boolean;
  normal?: boolean;
  compact?: boolean;
  side?: boolean;
}

const Card = ({
  children,
  className,
  bordered = true,
  imageFull = false,
  normal = false,
  compact = false,
  side = false,
  ...props
}: CardProps) => {
  return (
    <div
      className={cn('card', 'bg-base-100', className, {
        'card-bordered shadow-sm': bordered,
        'image-full': imageFull,
        'card-normal': normal,
        'card-compact': compact,
        'card-side': side,
      })}
      {...props}
    >
      {children}
    </div>
  );
};

interface CardBodyProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
  className?: string;
  centered?: boolean;
}

const CardBody = ({ children, className, centered, ...props }: CardBodyProps) => (
  <div
    className={cn('card-body', className, {
      'items-center text-center': centered,
    })}
    {...props}
  >
    {children}
  </div>
);

const CardTitle = ({ children, className, ...props }: React.HTMLAttributes<HTMLHeadingElement>) => (
  <h2 className={cn('card-title', className)} {...props}>
    {children}
  </h2>
);

const CardActions = ({ children, className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn('card-actions', className)} {...props}>
    {children}
  </div>
);

Card.Body = CardBody;
Card.Title = CardTitle;
Card.Actions = CardActions;

export { Card };
